import { DEFAULT_LIMIT_SETTINGS, isSendableNow, nextSendableAt } from "./email-sender-limit-rules";

const morning = { ...DEFAULT_LIMIT_SETTINGS, sendWindowStart: 9, sendWindowEnd: 12, weekdaysOnly: true };

export function isInitialEmailMorning(at: Date): boolean {
    return isSendableNow(morning, at);
}

export function nextInitialEmailMorning(at: Date): Date {
    return nextSendableAt(morning, at);
}

export class InitialEmailWindowClosed extends Error {
    constructor(readonly retryAt: Date) {
        super("첫 안내를 다음 평일 오전에 보냅니다.");
    }
}

export function requireInitialEmailMorning() {
    const now = new Date();
    if (!isInitialEmailMorning(now)) throw new InitialEmailWindowClosed(nextInitialEmailMorning(now));
}
