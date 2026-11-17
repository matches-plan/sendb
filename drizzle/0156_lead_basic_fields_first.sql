-- 리드관리 파티션은 늘 이름·이메일·연락처 칸을 갖고, 이 셋을 맨 위(0·1·2번)에 둔다. 나머지 칸은 원래 순서대로 그 아래.
-- 같은 뜻의 칸(key → 라벨 → 종류 email/phone)이 있으면 새로 만들지 않고 그 칸을 올린다. 라벨은 바꾸지 않는다.
-- 속성 타입이 아예 없는 리드 파티션은 "<워크스페이스> 리드" 타입을 만들어 붙이고 리드 기본 칸을 채운다.
-- src/lib/leads/basic-fields.ts · base-fields.ts · lead-field-type.ts 와 같은 규칙. 여러 번 실행해도 결과가 같다.
DO $$
DECLARE
    r record;
    ft integer;
    nm integer;
    em integer;
    ph integer;
    next_order integer;
    new_key text;
    name_keys text[] := ARRAY['name', 'contactName', 'username', 'fullName'];
    name_labels text[] := ARRAY['이름', '성함', '성명', '담당자', '담당자명', '이름/직함', '고객명', '신청자', '신청자명'];
    email_keys text[] := ARRAY['email', 'contactEmail'];
    email_labels text[] := ARRAY['이메일', '이메일 주소', 'E-mail', 'e-mail', 'email'];
    phone_keys text[] := ARRAY['phone', 'contact', 'mobile', 'phoneNumber', 'contactPhone', 'tel'];
    phone_labels text[] := ARRAY['연락처', '전화번호', '휴대폰', '휴대폰 번호', '휴대폰번호', '휴대전화', '핸드폰'];
BEGIN
    -- 1) 속성 타입이 없는 리드 파티션
    FOR r IN
        SELECT p.id, w.org_id, left(w.name || ' 리드', 100) AS tname
        FROM partitions p
        JOIN workspaces w ON w.id = p.workspace_id
        WHERE p.category = 'lead' AND p.field_type_id IS NULL AND w.default_field_type_id IS NULL
    LOOP
        SELECT id INTO ft FROM field_types WHERE org_id = r.org_id AND name = r.tname;
        IF ft IS NULL THEN
            INSERT INTO field_types (org_id, name, description, category)
            VALUES (r.org_id, r.tname, '리드관리 전용 속성 타입 — 레코드(콜드)와 분리', 'lead')
            RETURNING id INTO ft;
        END IF;
        UPDATE partitions SET field_type_id = ft, updated_at = now() WHERE id = r.id;

        SELECT COALESCE(MAX(sort_order), 0) INTO next_order FROM field_definitions WHERE field_type_id = ft;
        IF NOT EXISTS (SELECT 1 FROM field_definitions WHERE field_type_id = ft AND key IN ('companyName', 'companyname')) THEN
            next_order := next_order + 1;
            INSERT INTO field_definitions (field_type_id, key, label, field_type, sort_order)
            VALUES (ft, 'companyName', '기업명', 'text', next_order);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM field_definitions WHERE field_type_id = ft AND key = 'status') THEN
            next_order := next_order + 1;
            INSERT INTO field_definitions (field_type_id, key, label, field_type, sort_order, options, option_colors, track_history, is_groupable)
            VALUES (ft, 'status', '대응상태', 'select', next_order,
                '["신규", "부재", "연락 중", "핵심", "전환", "종료"]'::jsonb,
                '{"신규": "#3b82f6", "부재": "#9ca3af", "연락 중": "#f59e0b", "핵심": "#f97316", "전환": "#8b5cf6", "종료": "#9ca3af"}'::jsonb,
                1, 1);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM field_definitions WHERE field_type_id = ft
                       AND (key IN ('note', 'memo') OR trim(label) IN ('요청사항', '문의 내용', '문의내용'))) THEN
            next_order := next_order + 1;
            INSERT INTO field_definitions (field_type_id, key, label, field_type, sort_order)
            VALUES (ft, 'note', '요청사항', 'textarea', next_order);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM field_definitions WHERE field_type_id = ft AND key = 'source') THEN
            next_order := next_order + 1;
            INSERT INTO field_definitions (field_type_id, key, label, field_type, sort_order)
            VALUES (ft, 'source', '유입경로', 'text', next_order);
        END IF;
    END LOOP;

    -- 2) 리드 파티션이 쓰는 속성 타입마다 이름·이메일·연락처를 갖추고 맨 위로
    FOR ft IN
        SELECT DISTINCT COALESCE(p.field_type_id, w.default_field_type_id)
        FROM partitions p
        JOIN workspaces w ON w.id = p.workspace_id
        WHERE p.category = 'lead' AND COALESCE(p.field_type_id, w.default_field_type_id) IS NOT NULL
    LOOP
        -- 이름
        SELECT id INTO nm FROM field_definitions
        WHERE field_type_id = ft AND is_system = 0 AND field_type <> 'user_select'
          AND (key = ANY(name_keys) OR trim(label) = ANY(name_labels))
        ORDER BY CASE WHEN key = ANY(name_keys) THEN array_position(name_keys, key::text)
                      ELSE 100 + array_position(name_labels, trim(label)) END, sort_order, id
        LIMIT 1;
        IF nm IS NULL THEN
            SELECT COALESCE(MAX(sort_order), 0) + 1 INTO next_order FROM field_definitions WHERE field_type_id = ft;
            new_key := CASE WHEN EXISTS (SELECT 1 FROM field_definitions WHERE field_type_id = ft AND key = 'name') THEN 'contactName' ELSE 'name' END;
            INSERT INTO field_definitions (field_type_id, key, label, field_type, sort_order)
            VALUES (ft, new_key, '이름', 'text', next_order) RETURNING id INTO nm;
        END IF;

        -- 이메일
        SELECT id INTO em FROM field_definitions
        WHERE field_type_id = ft AND is_system = 0 AND field_type <> 'user_select' AND id <> nm
          AND (key = ANY(email_keys) OR trim(label) = ANY(email_labels) OR field_type = 'email')
        ORDER BY CASE WHEN key = ANY(email_keys) THEN array_position(email_keys, key::text)
                      WHEN trim(label) = ANY(email_labels) THEN 100 + array_position(email_labels, trim(label))
                      ELSE 1000 END, sort_order, id
        LIMIT 1;
        IF em IS NULL THEN
            SELECT COALESCE(MAX(sort_order), 0) + 1 INTO next_order FROM field_definitions WHERE field_type_id = ft;
            new_key := CASE WHEN EXISTS (SELECT 1 FROM field_definitions WHERE field_type_id = ft AND key = 'email') THEN 'contactEmail' ELSE 'email' END;
            INSERT INTO field_definitions (field_type_id, key, label, field_type, sort_order)
            VALUES (ft, new_key, '이메일', 'email', next_order) RETURNING id INTO em;
        END IF;

        -- 연락처
        SELECT id INTO ph FROM field_definitions
        WHERE field_type_id = ft AND is_system = 0 AND field_type <> 'user_select' AND id <> nm AND id <> em
          AND (key = ANY(phone_keys) OR trim(label) = ANY(phone_labels) OR field_type = 'phone')
        ORDER BY CASE WHEN key = ANY(phone_keys) THEN array_position(phone_keys, key::text)
                      WHEN trim(label) = ANY(phone_labels) THEN 100 + array_position(phone_labels, trim(label))
                      ELSE 1000 END, sort_order, id
        LIMIT 1;
        IF ph IS NULL THEN
            SELECT COALESCE(MAX(sort_order), 0) + 1 INTO next_order FROM field_definitions WHERE field_type_id = ft;
            new_key := CASE WHEN EXISTS (SELECT 1 FROM field_definitions WHERE field_type_id = ft AND key = 'phone') THEN 'contactPhone' ELSE 'phone' END;
            INSERT INTO field_definitions (field_type_id, key, label, field_type, sort_order)
            VALUES (ft, new_key, '연락처', 'phone', next_order) RETURNING id INTO ph;
        END IF;

        -- 순서: 이름 0, 이메일 1, 연락처 2, 나머지는 원래 순서대로 3부터
        UPDATE field_definitions f
        SET sort_order = o.rn
        FROM (
            SELECT id, (row_number() OVER (
                ORDER BY CASE id WHEN nm THEN 0 WHEN em THEN 1 WHEN ph THEN 2 ELSE 3 END, sort_order, id
            ) - 1)::integer AS rn
            FROM field_definitions
            WHERE field_type_id = ft
        ) o
        WHERE f.id = o.id AND f.sort_order <> o.rn;
    END LOOP;
END $$;
