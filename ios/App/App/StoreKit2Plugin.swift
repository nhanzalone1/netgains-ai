import Foundation
import Capacitor
import StoreKit

@available(iOS 15.0, *)
@objc(StoreKit2Plugin)
public class StoreKit2Plugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKit2Plugin"
    public let jsName = "StoreKit2"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentCodeRedemption", returnType: CAPPluginReturnPromise),
    ]

    private var updateListenerTask: Task<Void, Never>?

    override public func load() {
        updateListenerTask = listenForTransactions()
    }

    deinit {
        updateListenerTask?.cancel()
    }

    // Listen for transactions that happen outside a direct purchase call:
    // renewals, ask-to-buy approvals, purchases started on another device, refunds.
    private func listenForTransactions() -> Task<Void, Never> {
        return Task.detached { [weak self] in
            for await update in Transaction.updates {
                guard let self = self else { return }
                if case .verified(let transaction) = update {
                    self.notifyListeners("transactionUpdated", data: self.serialize(transaction))
                    await transaction.finish()
                }
            }
        }
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let identifiers = call.getArray("productIds", String.self) else {
            call.reject("productIds (string[]) required")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: identifiers)
                let payload = products.map { product -> [String: Any] in
                    return [
                        "id": product.id,
                        "displayName": product.displayName,
                        "description": product.description,
                        "price": NSDecimalNumber(decimal: product.price).doubleValue,
                        "displayPrice": product.displayPrice,
                        "currencyCode": product.priceFormatStyle.currencyCode,
                    ]
                }
                call.resolve(["products": payload])
            } catch {
                call.reject("Failed to load products: \(error.localizedDescription)")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId required")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Product not found: \(productId)")
                    return
                }

                let result = try await product.purchase()

                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        // Do NOT finish here — we finish only after the server has
                        // verified the receipt with Apple and persisted the entitlement.
                        // The JS layer calls the verify endpoint and then finishTransaction.
                        call.resolve([
                            "status": "purchased",
                            "transaction": self.serialize(transaction),
                        ])
                    case .unverified(_, let error):
                        call.reject("Transaction failed verification: \(error.localizedDescription)")
                    }
                case .userCancelled:
                    call.resolve(["status": "userCancelled"])
                case .pending:
                    // Ask-to-buy / SCA — final state arrives via Transaction.updates
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.reject("Unknown purchase result")
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                // Forces a sync with Apple; Transaction.currentEntitlements reflects result.
                try await AppStore.sync()

                var entitlements: [[String: Any]] = []
                for await result in Transaction.currentEntitlements {
                    if case .verified(let transaction) = result {
                        entitlements.append(self.serialize(transaction))
                    }
                }
                call.resolve(["entitlements": entitlements])
            } catch {
                call.reject("Restore failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func getCurrentEntitlements(_ call: CAPPluginCall) {
        Task {
            var entitlements: [[String: Any]] = []
            for await result in Transaction.currentEntitlements {
                if case .verified(let transaction) = result {
                    entitlements.append(self.serialize(transaction))
                }
            }
            call.resolve(["entitlements": entitlements])
        }
    }

    @objc func presentCodeRedemption(_ call: CAPPluginCall) {
        #if !targetEnvironment(simulator)
        Task { @MainActor in
            if #available(iOS 16.0, *) {
                // iOS 16+: use new scene-based API
                if let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene {
                    do {
                        try await AppStore.presentOfferCodeRedeemSheet(in: scene)
                        call.resolve()
                    } catch {
                        call.reject("Failed to present redemption sheet: \(error.localizedDescription)")
                    }
                } else {
                    call.reject("No active scene")
                }
            } else {
                SKPaymentQueue.default().presentCodeRedemptionSheet()
                call.resolve()
            }
        }
        #else
        call.reject("Code redemption is not available in the simulator")
        #endif
    }

    private func serialize(_ transaction: Transaction) -> [String: Any] {
        var payload: [String: Any] = [
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "productId": transaction.productID,
            "purchaseDate": Int(transaction.purchaseDate.timeIntervalSince1970 * 1000),
        ]
        if let expires = transaction.expirationDate {
            payload["expirationDate"] = Int(expires.timeIntervalSince1970 * 1000)
        }
        if let revoked = transaction.revocationDate {
            payload["revocationDate"] = Int(revoked.timeIntervalSince1970 * 1000)
        }
        return payload
    }
}
