/* 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
*/

(function(AppInfo, deviceInfo) {
    'use strict';

    console.log('WebOS adapter');

    function postMessage(type, data) {
        window.top.postMessage({
            type: type,
            data: data
        }, '*');
    }

    // List of supported features
    var SupportedFeatures = [
        'exit',
        'externallinkdisplay',
        'htmlaudioautoplay',
        'htmlvideoautoplay',
        'imageanalysis',
        'physicalvolumecontrol',
        'displaylanguage',
        'otherapppromotions',
        'targetblank',
        'screensaver',
        'subtitleappearancesettings',
        'subtitleburnsettings',
        'chromecast',
        'multiserver'
    ];

    window.NativeShell = {
        AppHost: {
            init: function () {
                postMessage('AppHost.init', AppInfo);
                return Promise.resolve(AppInfo);
            },

            appName: function () {
                postMessage('AppHost.appName', AppInfo.appName);
                return AppInfo.appName;
            },

            appVersion: function () {
                postMessage('AppHost.appVersion', AppInfo.appVersion);
                return AppInfo.appVersion;
            },

            deviceId: function () {
                postMessage('AppHost.deviceId', AppInfo.deviceId);
                return AppInfo.deviceId;
            },

            deviceName: function () {
                postMessage('AppHost.deviceName', AppInfo.deviceName);
                return AppInfo.deviceName;
            },

            exit: function () {
                postMessage('AppHost.exit');
            },

            getDefaultLayout: function () {
                postMessage('AppHost.getDefaultLayout', 'tv');
                return 'tv';
            },

            getDeviceProfile: function (profileBuilder) {
                postMessage('AppHost.getDeviceProfile');
                return profileBuilder({
                    enableMkvProgressive: false,
                    enableSsaRender: true,
                    supportsDolbyAtmos: deviceInfo ? deviceInfo.dolbyAtmos : null,
                    supportsDolbyVision: deviceInfo ? deviceInfo.dolbyVision : null,
                    supportsHdr10: deviceInfo ? deviceInfo.hdr10 : null
                });
            },

            getSyncProfile: function (profileBuilder) {
                postMessage('AppHost.getSyncProfile');
                return profileBuilder({ enableMkvProgressive: false });
            },

            supports: function (command) {
                var isSupported = command && SupportedFeatures.indexOf(command.toLowerCase()) != -1;
                postMessage('AppHost.supports', {
                    command: command,
                    isSupported: isSupported
                });
                return isSupported;
            },

            screen: function () {
                return deviceInfo ? {
                    width: deviceInfo.screenWidth,
                    height: deviceInfo.screenHeight
                } : null;
            }
        },

        selectServer: function () {
            postMessage('selectServer');
        },

        downloadFile: function (url) {
            postMessage('downloadFile', { url: url });
        },

        enableFullscreen: function () {
            postMessage('enableFullscreen');
        },

        disableFullscreen: function () {
            postMessage('disableFullscreen');
        },

        getPlugins: function () {
            postMessage('getPlugins');
            return [];
        },

        openUrl: function (url, target) {
            postMessage('openUrl', {
                url: url,
                target: target
            });
        },

        updateMediaSession: function (mediaInfo) {
            postMessage('updateMediaSession', { mediaInfo: mediaInfo });
        },

        hideMediaSession: function () {
            postMessage('hideMediaSession');
        }
    };

    function lunaMedia(method, parameters, callback) {
        var bridge = new PalmServiceBridge();
        bridge.onservicecallback = function (response) {
            if (callback) {
                var cb = callback;
                callback = null;
                cb(JSON.parse(response));
            }
        };
        bridge.call('luna://com.webos.media/' + method, JSON.stringify(parameters));
        return bridge;
    }

    // webOS mutes audio when video.playbackRate is not 1. Ask the media pipeline for the rate
    // instead (luna setPlayRate with audioOutput), which keeps audio. Subscribe to the pipeline
    // before setting its rate; the subscription bridge is kept on the element so it stays open.
    // Never call 'unload' here, it stops playback.
    if (typeof PalmServiceBridge === 'function') {
        var nativePlaybackRate = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');

        var withLunaSubscription = function (element, mediaId, onSubscribed) {
            if (element._lunaSubscribedMediaId === mediaId) {
                onSubscribed();
                return;
            }
            element._lunaSubscription = lunaMedia('subscribe', { mediaId: mediaId, subscribe: true }, function () {
                element._lunaSubscribedMediaId = mediaId;
                onSubscribed();
            });
        };

        var requestLunaPlaybackRate = function (element, mediaId, value) {
            element._lunaPlaybackRate = { mediaId: mediaId, value: value };
            withLunaSubscription(element, mediaId, function () {
                lunaMedia('setPlayRate', {
                    mediaId: mediaId,
                    playRate: value,
                    audioOutput: true
                }, function (response) {
                    if (response.returnValue === false) {
                        element._lunaPlaybackRate = undefined;
                        nativePlaybackRate.set.call(element, value);
                    }
                });
            });
        };

        Object.defineProperty(HTMLMediaElement.prototype, 'playbackRate', {
            configurable: true,
            get: function () {
                var rate = this._lunaPlaybackRate;
                if (rate && rate.mediaId === this.mediaId) {
                    return rate.value;
                }
                return nativePlaybackRate.get.call(this);
            },
            set: function (value) {
                var mediaId = this.mediaId;
                if (!mediaId) {
                    nativePlaybackRate.set.call(this, value);
                    return;
                }
                requestLunaPlaybackRate(this, mediaId, value);
            }
        });
    }
})(window.AppInfo, window.DeviceInfo);
