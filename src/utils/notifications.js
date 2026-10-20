import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export const NOTIF_CHANNEL_AI = 'lomeal_ai_channel';

export const initNotificationChannels = async () => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.createChannel({
      id: NOTIF_CHANNEL_AI,
      name: 'Analisis Makanan & AI',
      description: 'Notifikasi saat pemindaian foto makanan selesai dianalisis',
      importance: 4, // IMPORTANCE_HIGH: heads-up notification + sound
      visibility: 1, // VISIBILITY_PUBLIC
      sound: 'beep.wav',
      vibration: true,
      lights: true,
      lightColor: '#10B981',
    });
  } catch (e) {
    console.warn('[Notification] Gagal createChannel:', e);
  }
};

export const requestNotificationPermission = async () => {
  try {
    if (Capacitor.isNativePlatform()) {
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== 'granted') {
        const req = await LocalNotifications.requestPermissions();
        return req.display === 'granted';
      }
      return true;
    } else if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        return perm === 'granted';
      }
      return Notification.permission === 'granted';
    }
  } catch (e) {
    console.warn('[Notification] requestPermission error:', e);
  }
  return false;
};

export const sendLocalNotification = async ({ id, title, body, extra = {} }) => {
  try {
    if (Capacitor.isNativePlatform()) {
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== 'granted') {
        const req = await LocalNotifications.requestPermissions();
        if (req.display !== 'granted') {
          console.warn('[Notification] Izin notifikasi tidak aktif');
          return;
        }
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            id: id || Math.floor(Math.random() * 100000) + 5000,
            title: title || 'Lomeal',
            body: body ? (body.length > 150 ? body.slice(0, 147) + '...' : body) : '',
            schedule: { at: new Date(Date.now() + 100) },
            channelId: NOTIF_CHANNEL_AI,
            sound: 'beep.wav',
            smallIcon: 'ic_stat_lomeal',
            iconColor: '#10B981',
            extra,
          },
        ],
      });
    } else if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title || 'Lomeal', {
          body: body || '',
          icon: '/pwa-192x192.png',
          badge: '/ic_stat_lomeal.png',
        });
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then((perm) => {
          if (perm === 'granted') {
            new Notification(title || 'Lomeal', {
              body: body || '',
              icon: '/pwa-192x192.png',
              badge: '/ic_stat_lomeal.png',
            });
          }
        });
      }
    }
  } catch (err) {
    console.warn('[Notification] Gagal mengirim notifikasi:', err);
  }
};
