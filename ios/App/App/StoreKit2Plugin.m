#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(StoreKit2Plugin, "StoreKit2",
    CAP_PLUGIN_METHOD(getProducts, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(purchase, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(restore, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getCurrentEntitlements, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(presentCodeRedemption, CAPPluginReturnPromise);
)
