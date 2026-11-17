/** 상담 설정 오른쪽 본문 — 제목·설명 + 내용 (패널·모달 없이 페이지 안에 펼친다) */
export function SettingsSection({
    title,
    description,
    action,
    children,
}: {
    title: string;
    description?: React.ReactNode;
    /** 제목 오른쪽 (사용 여부 토글·추가 버튼 등) */
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="space-y-5">
            <header className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold">{title}</h2>
                    {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
                </div>
                {action}
            </header>
            {children}
        </section>
    );
}
