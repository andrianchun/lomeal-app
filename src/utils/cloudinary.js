// Upload sudah 100% pindah ke Firebase Storage (lihat utils/storageLogym.js).
// Yang tersisa cuma ini: URL foto post LAMA di feed masih nunjuk ke Cloudinary, jadi
// transform thumbnail-nya tetap dipakai biar gambar lama gak di-download resolusi penuh.
// Buat URL Firebase Storage fungsi ini otomatis no-op.
export const cloudinaryThumb = (url, width = 400) => {
    if (!url || !url.includes('/upload/')) return url;
    return url.replace('/upload/', `/upload/w_${width},q_auto,f_auto/`);
};
