//  ViewController.swift
//  Plastic Detox
//
//  Exists for one reason: to register the barcode scanner.
//
//  Capacitor 8 does not find plugins by scanning the runtime. It reads a
//  packageClassList out of capacitor.config.json, and `npx cap sync` builds
//  that list from the npm packages in package.json. Our scanner is a Swift
//  file in this target rather than a package, so it was never in the list and
//  never registered, and every call to it silently fell through to "no
//  scanner on this device".
//
//  Hand editing that list does not work either: the next sync overwrites it.
//  capacitorDidLoad is the supported hook, and it survives sync.

import Capacitor
import UIKit

class ViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(BarcodeScannerPlugin())
    }
}
