"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAsyncConfirm } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Loader2, Plus, X, MoreVertical, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { useSignatures } from "@/hooks/useSignatures";

interface SignatureData {
    name?: string;
    title?: string;
    company?: string;
    phone?: string;
    email?: string;
    websites?: string[];
    extra?: string;
}

interface EmailSignature {
    id: number;
    name: string;
    signature: string | null;
    isDefault: boolean;
    workspaceId: number | null;
}

function parseSignature(raw: string | null): SignatureData {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed;
    } catch {
        if (raw.trim()) return { extra: raw };
    }
    return {};
}

type Scope = "workspace" | "common";

/**
 * 리드젠 설정 › 사업부 › 이메일 서명 — 고른 사업부 서명과 공통 서명(사업부 없음).
 * 기본 서명은 사업부마다 하나 + 공통에 하나. 발송은 규칙 사업부의 기본 → 공통 기본 순으로 쓴다
 */
export function SignatureSettings({ workspaceId }: { workspaceId: number }) {
    const { signatures, createSignature, updateSignature, deleteSignature, isLoading, error } = useSignatures(workspaceId);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState({ name: "", sig: {} as SignatureData, scope: "workspace" as Scope });
    const [saving, setSaving] = useState(false);
    const { confirm, confirmationDialog } = useAsyncConfirm();

    const openNew = () => {
        setEditingId(null);
        setForm({ name: "", sig: {}, scope: "workspace" });
        setDialogOpen(true);
    };

    const openEdit = (s: EmailSignature) => {
        setEditingId(s.id);
        setForm({ name: s.name, sig: parseSignature(s.signature), scope: s.workspaceId === null ? "common" : "workspace" });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!form.name) {
            toast.error("서명 이름을 입력해주세요.");
            return;
        }
        setSaving(true);
        const sigJson = JSON.stringify(form.sig);
        const scopeWorkspaceId = form.scope === "common" ? null : workspaceId;
        try {
            const result = editingId
                ? await updateSignature(editingId, { name: form.name, signature: sigJson, workspaceId: scopeWorkspaceId })
                : await createSignature({ name: form.name, signature: sigJson, workspaceId: scopeWorkspaceId });
            if (result.success) {
                toast.success(editingId ? "서명이 수정되었습니다." : "서명이 추가되었습니다.");
                setDialogOpen(false);
            } else {
                toast.error(result.error || "저장에 실패했습니다.");
            }
        } catch {
            // 입력은 그대로 두고 저장 중 상태만 푼다 (UX-144)
            toast.error("저장 결과를 확인하지 못했습니다. 목록에서 반영 여부를 확인한 뒤 다시 시도해주세요.");
        } finally {
            setSaving(false);
        }
    };

    // 이 사업부에서 쓰이는 기본 서명 — 사업부 기본, 없으면 공통 기본
    const workspaceDefault = signatures.find((s) => s.isDefault && s.workspaceId === workspaceId);
    const effectiveDefault = workspaceDefault ?? signatures.find((s) => s.isDefault && s.workspaceId === null);

    // 지우기 전에 대상과 기본 서명 변경을 알린다. 실패하면 창을 유지해 다시 시도할 수 있다 (UX-151)
    const handleDelete = (s: EmailSignature) => {
        // 서버와 같은 규칙: 기본 서명을 지우면 같은 범위(이 사업부 또는 공통)에서 가장 먼저 만든 서명이 기본이 된다 (목록도 만든 순서)
        const next = s.isDefault ? signatures.find((o) => o.id !== s.id && o.workspaceId === s.workspaceId) : undefined;
        const defaultNote = s.isDefault && next ? `\n기본 서명이라 지우면 '${next.name}' 서명이 기본 서명이 됩니다.` : "";
        confirm({
            title: "서명 삭제",
            description: `'${s.name}' 서명을 삭제합니다. 되돌릴 수 없습니다.${defaultNote}`,
            onConfirm: async () => {
                let result: { success: boolean; error?: string };
                try {
                    result = await deleteSignature(s.id);
                } catch {
                    throw new Error("서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.");
                }
                if (!result.success) throw new Error(result.error || "삭제에 실패했습니다.");
                toast.success("서명이 삭제되었습니다.");
            },
        });
    };

    const handleSetDefault = async (s: EmailSignature) => {
        try {
            // 공통 서명을 이 사업부 기본으로 쓰려면 사업부 기본을 먼저 푼다 (사업부 기본이 공통 기본보다 앞선다)
            if (s.workspaceId === null && workspaceDefault) {
                const cleared = await updateSignature(workspaceDefault.id, { isDefault: false });
                if (!cleared.success) {
                    toast.error(cleared.error || "기본 서명 설정에 실패했습니다.");
                    return;
                }
            }
            const result = await updateSignature(s.id, { isDefault: true });
            if (result.success) toast.success("기본 서명으로 설정되었습니다.");
            else toast.error(result.error || "기본 서명 설정에 실패했습니다.");
        } catch {
            toast.error("기본 서명 설정 결과를 확인하지 못했습니다. 다시 시도해주세요.");
        }
    };

    const updateField = (field: keyof SignatureData, value: string) => {
        setForm((prev) => ({ ...prev, sig: { ...prev.sig, [field]: value } }));
    };

    const addWebsite = () => {
        setForm((prev) => ({ ...prev, sig: { ...prev.sig, websites: [...(prev.sig.websites || []), ""] } }));
    };

    const updateWebsite = (index: number, value: string) => {
        setForm((prev) => {
            const websites = [...(prev.sig.websites || [])];
            websites[index] = value;
            return { ...prev, sig: { ...prev.sig, websites } };
        });
    };

    const removeWebsite = (index: number) => {
        setForm((prev) => {
            const websites = [...(prev.sig.websites || [])];
            websites.splice(index, 1);
            return { ...prev, sig: { ...prev.sig, websites } };
        });
    };

    return (
        <>
            {confirmationDialog}
            <section className="space-y-5">
                <header className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">이메일 서명</h2>
                    <Button size="sm" onClick={openNew}>
                        <Plus className="h-4 w-4" />
                        추가
                    </Button>
                </header>
                {error ? (
                    <p role="alert" className="text-sm text-red-700">서명을 불러오지 못했습니다.</p>
                ) : isLoading ? (
                    <p className="text-sm text-muted-foreground">불러오는 중…</p>
                ) : signatures.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">서명이 없습니다.</p>
                ) : (
                    <div className="space-y-3">
                        {signatures.map((s) => {
                            const parsed = parseSignature(s.signature);
                            const preview = [parsed.name, parsed.title, parsed.company].filter(Boolean).join(" · ") || parsed.extra || "서명 내용 없음";
                            return (
                                <div
                                    key={s.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => openEdit(s)}
                                    onKeyDown={(e) => {
                                        if (e.target !== e.currentTarget) return;
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            openEdit(s);
                                        }
                                    }}
                                    aria-label={`${s.name} 수정`}
                                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/40 p-3 pl-1.5 hover:bg-muted/40"
                                >
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="shrink-0 text-muted-foreground"
                                                onClick={(e) => e.stopPropagation()}
                                                onKeyDown={(e) => e.stopPropagation()}
                                                aria-label={`${s.name} 메뉴`}
                                            >
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenuItem disabled={effectiveDefault?.id === s.id} onSelect={() => handleSetDefault(s)}>
                                                <Check className="h-4 w-4" />
                                                기본 서명으로 설정
                                            </DropdownMenuItem>
                                            <DropdownMenuItem variant="destructive" onSelect={() => handleDelete(s)}>
                                                <Trash2 className="h-4 w-4" />
                                                삭제
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium">{s.name}</span>
                                            {effectiveDefault?.id === s.id && <Badge variant="secondary" className="text-xs">기본</Badge>}
                                            {s.workspaceId === null && <Badge variant="outline" className="text-xs">공통</Badge>}
                                        </div>
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{preview}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                {/* 머리·아래 버튼은 고정, 가운데만 스크롤 */}
                <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
                    <DialogHeader className="border-b px-6 py-4">
                        <DialogTitle>{editingId ? "서명 수정" : "서명 추가"}</DialogTitle>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 scrollbar-thin">
                        <div className="space-y-2">
                            <Label>사용 범위</Label>
                            <Select value={form.scope} onValueChange={(v) => setForm((p) => ({ ...p, scope: v as Scope }))}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="workspace">이 사업부</SelectItem>
                                    <SelectItem value="common">공통 (모든 사업부)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>서명 이름</Label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                                placeholder="예: 공식 서명"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>이름</Label>
                                <Input
                                    value={form.sig.name || ""}
                                    onChange={(e) => updateField("name", e.target.value)}
                                    placeholder="홍길동"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>직책</Label>
                                <Input
                                    value={form.sig.title || ""}
                                    onChange={(e) => updateField("title", e.target.value)}
                                    placeholder="영업팀 매니저"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>회사</Label>
                                <Input
                                    value={form.sig.company || ""}
                                    onChange={(e) => updateField("company", e.target.value)}
                                    placeholder="Sendb Inc."
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>전화번호</Label>
                                <Input
                                    value={form.sig.phone || ""}
                                    onChange={(e) => updateField("phone", e.target.value)}
                                    placeholder="010-1234-5678"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>이메일 주소</Label>
                            <Input
                                type="email"
                                value={form.sig.email || ""}
                                onChange={(e) => updateField("email", e.target.value)}
                                placeholder="hong@company.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>웹사이트</Label>
                                <Button type="button" variant="ghost" size="sm" onClick={addWebsite}>
                                    <Plus className="h-4 w-4 mr-1" />추가
                                </Button>
                            </div>
                            {(form.sig.websites || []).map((url, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <Input
                                        value={url}
                                        onChange={(e) => updateWebsite(i, e.target.value)}
                                        placeholder="https://company.com"
                                    />
                                    <Button type="button" variant="ghost" size="icon" onClick={() => removeWebsite(i)}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <div className="space-y-2">
                            <Label>기타 정보</Label>
                            <Input
                                value={form.sig.extra || ""}
                                onChange={(e) => updateField("extra", e.target.value)}
                                placeholder="서울시 강남구 테헤란로 123"
                            />
                        </div>
                    </div>
                    <DialogFooter className="border-t px-6 py-4">
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {editingId ? "수정" : "추가"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
