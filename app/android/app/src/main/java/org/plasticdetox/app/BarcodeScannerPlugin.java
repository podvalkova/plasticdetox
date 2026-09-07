package org.plasticdetox.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.journeyapps.barcodescanner.ScanIntentResult;
import com.journeyapps.barcodescanner.ScanOptions;

import java.util.Arrays;

/**
 * The Android half of the scanner, answering the same bridge calls as
 * ios/App/App/Plugins/BarcodeScannerPlugin.swift: isSupported, the camera
 * permission pair (handled by the annotation), and scan(), which resolves
 * with a barcodes list where an empty list means the person backed out.
 *
 * ZXing embedded rather than ML Kit: no Play services dependency, works
 * offline always, and retail one dimensional codes are its home ground.
 * Only the symbologies a retail product carries are enabled, for the same
 * reason as on iOS: a packaging QR that resolves to a URL we cannot look
 * up reads as a broken scanner.
 */
@CapacitorPlugin(
    name = "BarcodeScanner",
    permissions = @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera")
)
public class BarcodeScannerPlugin extends Plugin {

    @PluginMethod
    public void isSupported(PluginCall call) {
        boolean supported = getContext().getPackageManager()
            .hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY);
        JSObject out = new JSObject();
        out.put("supported", supported);
        call.resolve(out);
    }

    @PluginMethod
    public void scan(PluginCall call) {
        ScanOptions options = new ScanOptions()
            .setDesiredBarcodeFormats(Arrays.asList(
                "EAN_13", "EAN_8", "UPC_A", "UPC_E", "CODE_128", "ITF"))
            .setBeepEnabled(false)
            .setOrientationLocked(true)
            .setPrompt("");
        Intent intent = options.createScanIntent(getContext());
        startActivityForResult(call, intent, "scanned");
    }

    @ActivityCallback
    private void scanned(PluginCall call, ActivityResult result) {
        if (call == null) return;
        ScanIntentResult scan =
            ScanIntentResult.parseActivityResult(result.getResultCode(), result.getData());
        JSArray barcodes = new JSArray();
        if (scan != null && scan.getContents() != null) {
            JSObject code = new JSObject();
            code.put("rawValue", scan.getContents());
            barcodes.put(code);
        }
        JSObject out = new JSObject();
        out.put("barcodes", barcodes);
        call.resolve(out);
    }
}
