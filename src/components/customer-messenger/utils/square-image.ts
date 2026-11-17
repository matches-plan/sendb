/** 이미지 가운데를 정사각형으로 잘라 size×size PNG로 만든다 (프로필 이미지용) */
export async function squareImage(file: File, size = 256): Promise<Blob> {
    const bitmap = await createImageBitmap(file).catch(() => {
        throw new Error("이미지를 읽지 못했어요. PNG·JPG 파일을 올려주세요.");
    });
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    bitmap.close();
    return new Promise((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("이미지를 만들지 못했어요."))), "image/png"),
    );
}
