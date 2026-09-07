package org.plasticdetox.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BarcodeScannerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
