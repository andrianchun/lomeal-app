package com.andrianchun.lomeal;

import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  // Batas pembesaran. Android membolehkan fontScale sampai 2.0, dan pada layar padat
  // (grid makan, kalender riwayat) angka setinggi itu bikin tata letak pecah total.
  private static final float MAX_FONT_SCALE = 1.3f;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // WebView TIDAK meneruskan setelan "Ukuran font" Android ke halaman kecuali textZoom
    // disetel sendiri — root font-size-nya tetap 16px apa pun setelan sistemnya. Jadi
    // satuan rem di CSS saja tidak cukup untuk APK; rem yang mengurus sisi PWA/browser,
    // baris di bawah ini yang mengurus sisi native.
    try {
      if (getBridge() != null && getBridge().getWebView() != null) {
        float scale = getResources().getConfiguration().fontScale;
        WebSettings settings = getBridge().getWebView().getSettings();
        settings.setTextZoom(Math.round(Math.min(scale, MAX_FONT_SCALE) * 100));
      }
    } catch (Exception e) {
      // Ukuran font bukan alasan yang sah untuk bikin app gagal start.
      android.util.Log.w("Lomeal", "Gagal menerapkan skala font sistem", e);
    }
  }
}
