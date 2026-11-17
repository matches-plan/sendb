/** 콜드메일 알림 담당자 (GET /api/leadgen/health-recipients) */
export interface HealthRecipientMember {
    id: string;
    name: string;
    email: string;
    enabled: boolean;
}

export interface HealthRecipientList {
    members: HealthRecipientMember[];
    canManage: boolean;
}
