import { useEffect, useRef } from 'react';
import { pushModal, popModal } from '../utils/backCloseStack';

/**
 * Bikin tombol back (hardware Android, gesture, atau back browser) menutup
 * modal/sheet/dialog INI dulu — bukan lompat ke tab/halaman sebelumnya atau
 * nutup app. Kalau beberapa lapis kebuka bareng (mis. sheet detail lalu dialog
 * konfirmasi hapus di atasnya), yang paling akhir dibuka ketutup duluan.
 *
 * Panggil di ATAS setiap early return (`if (!open) return null`) — hooks gak
 * boleh dipanggil bersyarat, makanya isOpen lewat parameter, bukan dari luar.
 *
 * @param {boolean} isOpen - state buka/tutup saat ini
 * @param {() => void} onClose - dipanggil pas back ditekan selagi isOpen true
 */
export default function useBackClose(isOpen, onClose) {
  const idRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose; // selalu yang terbaru — hindari closure basi

  useEffect(() => {
    if (!isOpen) return;
    idRef.current = pushModal(() => onCloseRef.current());
    return () => {
      if (idRef.current !== null) {
        popModal(idRef.current);
        idRef.current = null;
      }
    };
  }, [isOpen]);
}
