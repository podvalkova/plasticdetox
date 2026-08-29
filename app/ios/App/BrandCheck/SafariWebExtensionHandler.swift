//  SafariWebExtensionHandler.swift
//  Plastic Detox Brand Check
//
//  The native half of the Safari web extension.
//
//  There is deliberately almost nothing here. The extension does its whole job
//  in JavaScript, from the same extension/ folder the Chrome build ships, so
//  the two browsers can never disagree about a verdict. This class exists only
//  because Safari requires a native principal class to load a web extension.

import SafariServices
import os.log

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        // Nothing in the extension calls sendNativeMessage today. If something
        // ever does, it lands here; until then this is an honest no-op rather
        // than an echo that could be mistaken for a working channel.
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: ["ok": true]]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
