import { useState, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ImageIcon, Search } from "lucide-react";
import { useEmailAssets } from "../hooks/useEmailAssets";
import AssetCard from "./AssetCard";
import AssetUploadDropzone from "./AssetUploadDropzone";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SelectedAsset } from "../types";

interface AssetPickerProps {
    open: boolean;
    // 이미 선택된 에셋 id (열 때 초기 선택 상태로 표시)
    initialSelectedIds?: number[];
    onClose: () => void;
    onConfirm: (selected: SelectedAsset[]) => void;
}

// 에셋 그리드에서 하나 이상 선택 → {id, url}[] 반환. AI 규칙 편집·템플릿 삽입 공용.
// 선택 상태는 열 때마다 새로 만든다 — 열린 시점의 initialSelectedIds(비동기로 채워진 저장값 포함)가 초기 선택이고,
// 열려 있는 동안 부모가 다시 그려져도 사용자 선택을 덮어쓰지 않는다 (UX-145).
export default function AssetPicker({ open, onClose, ...rest }: AssetPickerProps) {
    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
            {open && <AssetPickerContent onClose={onClose} {...rest} />}
        </Dialog>
    );
}

function AssetPickerContent({
    initialSelectedIds = [],
    onClose,
    onConfirm,
}: Omit<AssetPickerProps, "open">) {
    const { assets, isLoading, upload } = useEmailAssets(true);
    const [selectedIds, setSelectedIds] = useState<number[]>(initialSelectedIds);
    const [query, setQuery] = useState("");
    // 고른 적이 없으면 올린 이미지가 없을 때만 '새로 올리기'를 먼저 보인다
    const [pickedTab, setPickedTab] = useState<"pick" | "upload" | null>(null);
    const tab = pickedTab ?? (!isLoading && assets.length === 0 ? "upload" : "pick");

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return assets;
        return assets.filter((a) => a.name.toLowerCase().includes(q));
    }, [assets, query]);

    const toggle = (id: number) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const handleConfirm = () => {
        const selected = assets
            .filter((a) => selectedIds.includes(a.id))
            .map((a) => ({ id: a.id, url: a.url }));
        onConfirm(selected);
        onClose();
    };

    // 올린 이미지는 바로 선택해 두고 선택 칸으로 돌아간다
    const handleUploaded = (uploaded: { id: number }[]) => {
        setSelectedIds((prev) => [...prev, ...uploaded.map((a) => a.id).filter((id) => !prev.includes(id))]);
        setQuery("");
        setPickedTab("pick");
    };

    const hasAssets = assets.length > 0;

    return (
            <DialogContent className="max-w-2xl gap-0">
                <DialogHeader>
                    <DialogTitle>이미지 에셋 선택</DialogTitle>
                    <DialogDescription className="sr-only">본문에 넣을 이미지를 고르거나 새로 올립니다.</DialogDescription>
                </DialogHeader>

                <Tabs value={tab} onValueChange={(v) => setPickedTab(v as "pick" | "upload")} className="mt-4 gap-0">
                    <TabsList>
                        <TabsTrigger value="pick">기존에서 선택</TabsTrigger>
                        <TabsTrigger value="upload">새로 올리기</TabsTrigger>
                    </TabsList>

                <TabsContent value="upload" className="mt-4">
                    <AssetUploadDropzone upload={upload} onUploaded={handleUploaded} />
                </TabsContent>

                <TabsContent value="pick">
                {hasAssets && (
                    <div className="relative mt-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="이름으로 검색"
                            aria-label="에셋 이름으로 검색"
                            className="pl-9"
                        />
                    </div>
                )}

                <div className="mt-4 min-h-55 max-h-[52vh] overflow-y-auto -mr-1 pr-1">
                    {isLoading ? (
                        <div className="flex justify-center py-16">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : !hasAssets ? (
                        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                            <ImageIcon className="h-8 w-8" />
                            <p className="text-sm">올린 이미지가 없습니다.</p>
                            <Button variant="outline" size="sm" onClick={() => setPickedTab("upload")}>새로 올리기</Button>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                            <Search className="h-7 w-7" />
                            <p className="text-sm">&quot;{query}&quot; 검색 결과가 없습니다.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5" role="group" aria-label="이미지 에셋">
                            {filtered.map((asset) => (
                                <AssetCard
                                    key={asset.id}
                                    asset={asset}
                                    selected={selectedIds.includes(asset.id)}
                                    onClick={() => toggle(asset.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
                </TabsContent>
                </Tabs>

                <DialogFooter className="mt-4 border-t pt-4 sm:justify-between">
                    <span className="text-sm text-muted-foreground self-center" aria-live="polite">
                        <span className="font-semibold text-foreground">{selectedIds.length}개</span> 선택됨
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>
                            취소
                        </Button>
                        <Button onClick={handleConfirm} disabled={selectedIds.length === 0}>
                            이미지 삽입
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
    );
}
