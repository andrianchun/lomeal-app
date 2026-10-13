import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export const sendLocalNotification = async ({ id, title, body, extra = {} }) => {
  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: id || Math.floor(Math.random() * 100000) + 5000,
            title: title || 'Lomeal',
            body: body ? (body.length > 150 ? body.slice(0, 147) + '...' : body) : '',
            schedule: { at: new Date(Date.now() + 100) },
            sound: 'beep.wav',
            extra,
          },
        ],
      });
    } else if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title || 'Lomeal', {
          body: body || '',
          icon: '/bg-dashboard.webp',
        });
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then((perm) => {
          if (perm === 'granted') {
            new Notification(title || 'Lomeal', {
              body: body || '',
              icon: '/bg-dashboard.webp',
            });
          }
        });
      }
    }
  } catch (err) {
    console.warn('[Notification] Gagal mengirim notifikasi:', err);
  }
};
