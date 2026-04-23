import UIKit
import Capacitor

// Writes to both stdout (visible in Xcode debug console) and the unified
// logging system (visible in macOS Console.app filtered to the device).
fileprivate func _logBoth(_ message: String) {
    print(message)
    NSLog("%@", message)
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        _logBoth("[NetGains] AppDelegate.didFinishLaunchingWithOptions — app started")
        // Belt-and-suspenders: try to register StoreKit2Plugin on the next
        // runloop tick, once the storyboard has instantiated the root VC.
        // This is a fallback in case MainViewController.capacitorDidLoad()
        // doesn't fire (storyboard wiring issue, class-lookup failure, etc.).
        DispatchQueue.main.async { [weak self] in
            self?.registerLocalPlugins()
        }
        return true
    }

    private func registerLocalPlugins() {
        guard #available(iOS 15.0, *) else {
            _logBoth("[NetGains] AppDelegate: iOS < 15, skipping StoreKit2 registration")
            return
        }

        let rootVC = window?.rootViewController
        _logBoth("[NetGains] AppDelegate.registerLocalPlugins — rootVC=\(String(describing: type(of: rootVC)))")

        // Walk presented/child VCs to find the Capacitor bridge VC.
        if let bridgeVC = findBridgeViewController(from: rootVC) {
            if let bridge = bridgeVC.bridge {
                if bridge.plugin(withName: "StoreKit2") != nil {
                    _logBoth("[NetGains] AppDelegate: StoreKit2 already registered (by MainViewController) — skipping fallback")
                } else {
                    bridge.registerPluginType(StoreKit2Plugin.self)
                    _logBoth("[NetGains] AppDelegate: StoreKit2Plugin registered via fallback path")
                }
            } else {
                _logBoth("[NetGains] AppDelegate: bridge is nil on bridgeVC — retrying in 500ms")
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                    self?.registerLocalPlugins()
                }
            }
        } else {
            _logBoth("[NetGains] AppDelegate: no CAPBridgeViewController found in hierarchy — retrying in 500ms")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                self?.registerLocalPlugins()
            }
        }
    }

    private func findBridgeViewController(from vc: UIViewController?) -> CAPBridgeViewController? {
        guard let vc = vc else { return nil }
        if let bridgeVC = vc as? CAPBridgeViewController { return bridgeVC }
        for child in vc.children {
            if let found = findBridgeViewController(from: child) { return found }
        }
        if let presented = vc.presentedViewController {
            return findBridgeViewController(from: presented)
        }
        return nil
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
