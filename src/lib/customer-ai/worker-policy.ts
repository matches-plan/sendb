type WorkerEnvironment = {
    NODE_ENV?: string;
    CUSTOMER_AI_WORKER?: string;
    CUSTOMER_AI_WORKSPACES?: string;
};

// An omitted scope preserves existing deployments; an invalid explicit scope
// must never accidentally enable automatic replies for every workspace.
export function supportWorkerWorkspaces(value?: string): number[] | null {
    if (value === undefined) return null;
    const parts = value.split(",").map((part) => part.trim());
    if (parts.some((part) => !/^[1-9]\d*$/.test(part))) return [];
    const ids = parts.map(Number);
    return ids.every(Number.isSafeInteger) ? [...new Set(ids)] : [];
}

export function supportWorkerEnabled(
    environment: WorkerEnvironment,
    workspaceId?: number,
): boolean {
    if (
        environment.NODE_ENV !== "production" ||
        environment.CUSTOMER_AI_WORKER !== "on"
    )
        return false;
    const scope = supportWorkerWorkspaces(environment.CUSTOMER_AI_WORKSPACES);
    return (
        scope === null ||
        (workspaceId === undefined
            ? scope.length > 0
            : scope.includes(workspaceId))
    );
}

export const BACKOFFICE_WORKSPACE_ID = 9;

export function faqQuestionLimit(workspaceId: number) {
    return workspaceId === BACKOFFICE_WORKSPACE_ID ? 30 : 10;
}

export function handoffFollowupEnabled(value: string | undefined, workspaceId: number) {
    return value === "9" && workspaceId === BACKOFFICE_WORKSPACE_ID;
}

/** Workspace IDs are globally unique. Workspace 9 is 2-백오피스랩 in production. */
export function sentenceGroundingEnabled(value: string | undefined, workspaceId: number) {
    return value === "9" && workspaceId === BACKOFFICE_WORKSPACE_ID;
}
