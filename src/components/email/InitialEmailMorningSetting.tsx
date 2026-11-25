import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function InitialEmailMorningSetting({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div>
                <Label htmlFor="weekday-morning">첫 안내를 평일 오전에 보내기</Label>
                <p id="weekday-morning-hours" className="text-xs text-muted-foreground">한국시간 월~금 오전 9시부터 정오 전까지 발송합니다. 그 밖의 시간에 등록하면 다음 발송 시간까지 대기합니다.</p>
            </div>
            <Switch id="weekday-morning" aria-describedby="weekday-morning-hours" checked={checked} onCheckedChange={onChange} />
        </div>
    );
}
