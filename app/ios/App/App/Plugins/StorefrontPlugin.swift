//  StorefrontPlugin.swift
//  Plastic Detox
//
//  Which App Store this person buys from.
//
//  Apple's guideline 3.1.1(a) permits a link to a purchase outside the app on
//  the United States storefront and forbids it everywhere else. Storefront is
//  a property of the App Store account, not of the phone: someone in Berlin
//  with a US account is a US customer, and an American abroad is still one.
//  So device region, language and timezone are all the wrong question, and
//  answering the wrong question here means shipping a link to somebody the
//  rule says must not see it.
//
//  StoreKit answers the right one. The reply is deliberately empty rather than
//  a guess when StoreKit will not say, and the web layer treats empty as "not
//  the United States", so silence closes the door rather than opening it.

import Capacitor
import StoreKit

@objc(StorefrontPlugin)
public class StorefrontPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StorefrontPlugin"
    public let jsName = "Storefront"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "country", returnType: CAPPluginReturnPromise)
    ]

    @objc public func country(_ call: CAPPluginCall) {
        if #available(iOS 15.0, *) {
            Task {
                // Three letter, ISO 3166-1 alpha-3: "USA", not "US".
                let code = await Storefront.current?.countryCode ?? ""
                call.resolve(["country": code])
            }
            return
        }
        call.resolve(["country": SKPaymentQueue.default().storefront?.countryCode ?? ""])
    }
}
