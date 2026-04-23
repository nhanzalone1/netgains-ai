import UIKit
import Capacitor

// Root view controller wired via Main.storyboard. Capacitor 7 only auto-loads
// plugins listed in `packageClassList`, which `cap sync` populates from npm
// plugins only. App-local plugins like StoreKit2Plugin must be registered
// explicitly. @objc ensures the storyboard can instantiate this class via
// Objective-C runtime lookup.
@objc(MainViewController)
public class MainViewController: CAPBridgeViewController {

    public override func viewDidLoad() {
        super.viewDidLoad()
        print("[NetGains] MainViewController.viewDidLoad — storyboard wired correctly")
        NSLog("[NetGains] MainViewController.viewDidLoad — storyboard wired correctly")
    }

    public override func capacitorDidLoad() {
        print("[NetGains] MainViewController.capacitorDidLoad — registering StoreKit2Plugin")
        NSLog("[NetGains] MainViewController.capacitorDidLoad — registering StoreKit2Plugin")
        if #available(iOS 15.0, *) {
            if let bridge = bridge {
                bridge.registerPluginType(StoreKit2Plugin.self)
                print("[NetGains] StoreKit2Plugin registered via bridge")
                NSLog("[NetGains] StoreKit2Plugin registered via bridge")
            } else {
                print("[NetGains] WARNING: bridge is nil in capacitorDidLoad")
                NSLog("[NetGains] WARNING: bridge is nil in capacitorDidLoad")
            }
        } else {
            print("[NetGains] StoreKit2Plugin requires iOS 15; skipping")
            NSLog("[NetGains] StoreKit2Plugin requires iOS 15; skipping")
        }
    }
}
