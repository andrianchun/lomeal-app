export const CLOUD_NAME = "dxkhyzw50";
export const UPLOAD_PRESET = "ml_default";

export const uploadToCloudinary = async (file, publicId = null, folder = null) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);
    
    // Jika ada folder spesifik
    if (folder) {
        formData.append("folder", folder);
    }

    // Jika upload preset mengizinkan custom public_id, ini akan menimpa foto lama
    if (publicId) {
        formData.append("public_id", publicId);
    }

    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
            method: "POST",
            body: formData,
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error?.message || "Gagal upload ke Cloudinary");
        }
        
        return data.secure_url;
    } catch (error) {
        console.error("Cloudinary upload error:", error);
        throw error;
    }
};
