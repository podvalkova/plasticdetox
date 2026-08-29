//  BarcodeScannerPlugin.swift
//  Plastic Detox
//
//  A barcode scanner built on AVFoundation rather than a third party library.
//
//  ML Kit was the obvious choice and turned out to be the wrong one: it ships
//  no arm64 simulator slice, so the whole app could never be run on a modern
//  simulator, and it added around twenty megabytes plus a runtime module
//  download for a job iOS has done natively since the iPhone 5.
//
//  AVCaptureMetadataOutput reads every symbology a retail product carries, is
//  in the system already, and lets the scanning screen look like the rest of
//  the app.

import AVFoundation
import Capacitor
import UIKit

@objc(BarcodeScannerPlugin)
public class BarcodeScannerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BarcodeScannerPlugin"
    public let jsName = "BarcodeScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise)
    ]

    private var presented: ScannerViewController?

    @objc public func isSupported(_ call: CAPPluginCall) {
        // The simulator has no camera. Saying so lets the web layer offer
        // search instead of a button that opens a black rectangle.
        let has = AVCaptureDevice.default(for: .video) != nil
        call.resolve(["supported": has])
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(["camera": Self.stateName(AVCaptureDevice.authorizationStatus(for: .video))])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        AVCaptureDevice.requestAccess(for: .video) { _ in
            DispatchQueue.main.async {
                call.resolve(["camera": Self.stateName(AVCaptureDevice.authorizationStatus(for: .video))])
            }
        }
    }

    private static func stateName(_ status: AVAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "granted"
        case .denied, .restricted: return "denied"
        default: return "prompt"
        }
    }

    @objc public func scan(_ call: CAPPluginCall) {
        guard AVCaptureDevice.default(for: .video) != nil else {
            call.reject("No camera on this device")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self, let host = self.bridge?.viewController else {
                call.reject("No view controller to present from")
                return
            }

            let scanner = ScannerViewController()
            scanner.modalPresentationStyle = .fullScreen
            // An empty array is a successful scan of nothing, which is what a
            // cancel is. The web layer treats it as "the user backed out".
            scanner.onFinish = { [weak self] value in
                self?.presented = nil
                let codes = value.map { [["rawValue": $0, "format": "UNKNOWN"]] } ?? []
                call.resolve(["barcodes": codes])
            }
            self.presented = scanner
            host.present(scanner, animated: true)
        }
    }
}

/// The scanning screen: a live preview, a cut out frame, and a way out.
final class ScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {

    var onFinish: ((String?) -> Void)?

    private let session = AVCaptureSession()
    private var preview: AVCaptureVideoPreviewLayer?
    private var finished = false

    // Only the symbologies a retail product carries. QR codes are deliberately
    // absent: scanning a packaging recycling QR would resolve to a URL we
    // cannot look up, which reads as a broken scanner rather than a miss.
    private let symbologies: [AVMetadataObject.ObjectType] = [
        .ean13, .ean8, .upce, .code128, .code39, .itf14, .interleaved2of5
    ]

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureSession()
        addOverlay()
    }

    private func configureSession() {
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else { return }
        session.addInput(input)

        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { return }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = symbologies.filter {
            output.availableMetadataObjectTypes.contains($0)
        }

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.bounds
        view.layer.addSublayer(layer)
        preview = layer

        // Starting a capture session blocks, so it never happens on main.
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.session.startRunning()
        }
    }

    private func addOverlay() {
        let frame = UIView()
        frame.translatesAutoresizingMaskIntoConstraints = false
        frame.layer.borderColor = UIColor.white.withAlphaComponent(0.9).cgColor
        frame.layer.borderWidth = 3
        frame.layer.cornerRadius = 14
        view.addSubview(frame)

        let hint = UILabel()
        hint.translatesAutoresizingMaskIntoConstraints = false
        hint.text = "Point at the barcode"
        hint.textColor = .white
        hint.font = .systemFont(ofSize: 16, weight: .semibold)
        hint.textAlignment = .center
        view.addSubview(hint)

        let cancel = UIButton(type: .system)
        cancel.translatesAutoresizingMaskIntoConstraints = false
        cancel.setTitle("Cancel", for: .normal)
        cancel.titleLabel?.font = .systemFont(ofSize: 17, weight: .bold)
        cancel.setTitleColor(.black, for: .normal)
        cancel.backgroundColor = .white
        cancel.layer.cornerRadius = 24
        cancel.contentEdgeInsets = UIEdgeInsets(top: 12, left: 28, bottom: 12, right: 28)
        cancel.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        view.addSubview(cancel)

        NSLayoutConstraint.activate([
            frame.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            frame.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -40),
            frame.widthAnchor.constraint(equalTo: view.widthAnchor, multiplier: 0.76),
            frame.heightAnchor.constraint(equalTo: frame.widthAnchor, multiplier: 0.62),

            hint.topAnchor.constraint(equalTo: frame.bottomAnchor, constant: 20),
            hint.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            cancel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            cancel.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -28)
        ])
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview?.frame = view.bounds
    }

    @objc private func cancelTapped() { finish(nil) }

    func metadataOutput(_ output: AVCaptureMetadataOutput,
                        didOutput metadataObjects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        guard !finished,
              let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let value = object.stringValue else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        finish(value)
    }

    private func finish(_ value: String?) {
        guard !finished else { return }
        finished = true
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.session.stopRunning()
        }
        dismiss(animated: true) { [weak self] in
            self?.onFinish?(value)
        }
    }
}
