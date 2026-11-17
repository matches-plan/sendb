import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { EmailAsset } from "../types";

const ACCEPT = "image/jpeg,image/png,image/gif,image/webp";

interface AssetUploadDropzoneProps {
    // useEmailAssets().upload — 올린 뒤 목록을 다시 불러온다
    upload: (file: File) => Promise<{ success: boolean; data?: EmailAsset; error?: string }>;
    onUploaded: (assets: EmailAsset[]) => void;
}

// 끌어 놓거나 눌러서 이미지를 올리는 칸. 여러 장을 한 번에 올릴 수 있다
export default function AssetUploadDropzone({ upload, onUploaded }: AssetUploadDropzoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);

    const handleFiles = async (files: File[]) => {
        const images = files.filter((f) => ACCEPT.split(",").includes(f.type));
        if (images.length < files.length) toast.error("JPG·PNG·GIF·WEBP 이미지만 올릴 수 있습니다.");
        if (images.length === 0) return;
        setUploading(true);
        const done: EmailAsset[] = [];
        try {
            for (const file of images) {
                const result = await upload(file);
                if (result.success && result.data) done.push(result.data);
                else toast.error(result.error || `${file.name} 업로드에 실패했습니다.`);
            }
        } finally {
            setUploading(false);
        }
        if (done.length > 0) {
            toast.success(`${done.length}개 업로드했습니다.`);
            onUploaded(done);
        }
    };

    return (
        <>
        <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void handleFiles(Array.from(e.dataTransfer.files));
            }}
            className={cn(
                "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 py-16 text-sm text-muted-foreground transition-colors hover:bg-muted/50",
                dragging && "border-primary bg-primary/5 text-foreground",
            )}
        >
            {uploading ? <Loader2 className="size-7 animate-spin" /> : <Upload className="size-7" />}
            <span>{uploading ? "올리는 중…" : "이미지를 끌어 놓거나 눌러서 선택"}</span>
        </button>
            <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    void handleFiles(files);
                }}
            />
        </>
    );
}
