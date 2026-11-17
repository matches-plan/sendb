"use client";
import { useState } from "react";

/** 상담창 프로필 이미지(1:1). 없거나 못 불러오면 이름 첫 글자를 포인트 컬러로 보인다 */
export function ProfileAvatar({ src, name, color, size }: { src?: string; name: string; color: string; size: number }) {
    const [failed, setFailed] = useState("");
    const box = { width: size, height: size, borderRadius: Math.round(size * 0.34) };
    if (src && failed !== src)
        return (
            // 독립 상담 번들은 Next.js 이미지 서버 없이 그린다
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={src}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setFailed(src)}
                className="shrink-0 border border-black/[0.06] object-cover"
                style={box}
            />
        );
    return (
        <span
            aria-hidden="true"
            className="flex shrink-0 items-center justify-center font-bold"
            style={{ ...box, backgroundColor: `${color}1f`, color, fontSize: Math.round(size * 0.42) }}
        >
            {name.trim().slice(0, 1) || "?"}
        </span>
    );
}
