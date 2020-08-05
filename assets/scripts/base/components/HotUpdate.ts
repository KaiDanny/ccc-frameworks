import { BaseComponent } from "../core/BaseComponent";

const { ccclass, property, menu } = cc._decorator;

/**
 * 热更广播事件枚举
 */
export enum HotUpdateEventType {
    HOT_NEED, // 需要更新
    HOT_ERROE, // 更新出错
    HOT_PASSED, // 不需要更新,直接通过
    HOT_UPDATING, // 正在更新
    CHECK_UPDATE, // 通知进行检查更新
    START_UPDATE, // 通知开始进行更新
    RETRY_UPDATE  // 通知尝试重新更新
}

@ccclass
@menu("扩展组件/HotUpdate")
export class HotUpdate extends BaseComponent {


    @property({ type: cc.Asset })
    private manifestUrl: cc.Asset = null;

    private _updating: boolean = false;
    private _canRetry: boolean = false;
    private _storagePath: string = '';

    private _assetManager = null;
    // private _failCount: number = 0;

    onInitData() {
        this.Event.on("CHECK_UPDATE", this.checkUpdate.bind(this));
        this.Event.on("START_UPDATE", this.hotUpdate.bind(this));
        this.Event.on("RETRY_UPDATE", this.retry.bind(this));
    }

    onLoad() {
        if (!cc.sys.isNative) return;
        this._storagePath = ((jsb.fileUtils ? jsb.fileUtils.getWritablePath() : '/') + 'remote-assets');
        this._assetManager = new jsb.AssetsManager('', this._storagePath, this.versionCompareHandle);
        this._assetManager.setVerifyCallback(this.assetsVerify.bind(this));
        if (cc.sys.os === cc.sys.OS_ANDROID) {
            this._assetManager.setMaxConcurrentTask(2);
        }
        cc.log('远程资源的存储路径 : ' + this._storagePath);
    }


    start() {
        this.checkUpdate();
    }


    /**
     *  检查更新回调
     */
    private checkCb(event) {
        switch (event.getEventCode()) {
            case jsb.EventAssetsManager.ERROR_NO_LOCAL_MANIFEST:
                console.log("没有发现本地清单文件，跳过热更新.");
                this.Event.emit(HotUpdateEventType[HotUpdateEventType.HOT_PASSED], event);
                break;
            case jsb.EventAssetsManager.ERROR_DOWNLOAD_MANIFEST:
            case jsb.EventAssetsManager.ERROR_PARSE_MANIFEST:
                console.log("下载清单文件失败，跳过热更新.");
                this.Event.emit(HotUpdateEventType[HotUpdateEventType.HOT_ERROE], event);
                break;
            case jsb.EventAssetsManager.ALREADY_UP_TO_DATE:
                console.log("当前已经是最新版本.");
                this.Event.emit(HotUpdateEventType[HotUpdateEventType.HOT_PASSED], event);
                break;
            case jsb.EventAssetsManager.NEW_VERSION_FOUND:
                console.log('找到新版本，请尝试更新.');
                this.Event.emit(HotUpdateEventType[HotUpdateEventType.HOT_NEED], event);
                break;
            default:
                return;
        }
        this._assetManager.setEventCallback(null);
        this._updating = false;
    }


    /**
     * 更新回调
     */
    private updateCb(event) {
        var needRestart = false;
        var failed = false;
        switch (event.getEventCode()) {
            case jsb.EventAssetsManager.ERROR_NO_LOCAL_MANIFEST:
                failed = true;
                break;
            case jsb.EventAssetsManager.UPDATE_PROGRESSION:
                // console.log('正在更新.');
                this.Event.emit(HotUpdateEventType[HotUpdateEventType.HOT_UPDATING], event);
                break;
            case jsb.EventAssetsManager.ERROR_DOWNLOAD_MANIFEST:
            case jsb.EventAssetsManager.ERROR_PARSE_MANIFEST:
                console.log('下载清单文件失败，跳过热更新.');
                this.Event.emit(HotUpdateEventType[HotUpdateEventType.HOT_ERROE], event);
                failed = true;
                break;
            case jsb.EventAssetsManager.ALREADY_UP_TO_DATE:
                console.log('当前已经是最新版本.');
                this.Event.emit("PASSED", event);
                failed = true;
                cc.game.restart();
                break;
            case jsb.EventAssetsManager.UPDATE_FINISHED:
                console.log('更新完成. ' + event.getMessage());
                this.Event.emit("FINISHED", event);
                needRestart = true;
                cc.game.restart();
                break;
            case jsb.EventAssetsManager.UPDATE_FAILED:
                console.log('更新失败. ' + event.getMessage());
                this.Event.emit(HotUpdateEventType[HotUpdateEventType.HOT_ERROE], event);
                this.Event.emit("HOT_ERROE", event);
                this._updating = false;
                this._canRetry = true;
                break;
            case jsb.EventAssetsManager.ERROR_UPDATING:
                console.log('资源更新错误: ' + event.getAssetId() + ', ' + event.getMessage());
                break;
            case jsb.EventAssetsManager.ERROR_DECOMPRESS:
                console.log('资源更新错误: ' + event.getMessage());
                break;
            default:
                break;
        }

        if (failed) {
            this._assetManager.setEventCallback(null);
            this._updating = false;
        }

        if (needRestart) {
            this._assetManager.setEventCallback(null);
            var searchPaths = jsb.fileUtils.getSearchPaths();
            var newPaths = this._assetManager.getLocalManifest().getSearchPaths();
            Array.prototype.unshift.apply(searchPaths, newPaths);
            cc.sys.localStorage.setItem('HotUpdateSearchPaths', JSON.stringify(searchPaths));
            jsb.fileUtils.setSearchPaths(searchPaths);
            cc.audioEngine.stopAll();
            cc.game.restart();
        }
    }


    /**
     * 重新下载失败的资源
     */
    private retry() {
        if (!this._updating && this._canRetry) {
            this._canRetry = false;
            console.log('重试失败的资源...');
            this._assetManager.downloadFailedAssets();
        }
    }


    /**
     * 检查更新
     */
    private checkUpdate() {
        if (this._updating) { return; }
        this.loadLocalManifest();
        if (!this._assetManager.getLocalManifest() || !this._assetManager.getLocalManifest().isLoaded()) {
            this.Event.emit("PASSED", { msg: "未能加载本地清单 ..." });
            return;
        }
        this._assetManager.setEventCallback(this.checkCb.bind(this));
        this._assetManager.checkUpdate();
        this._updating = false;
    }


    /**
     * load对应清单文件
     */
    private loadLocalManifest(): any {
        console.log("load清单文件")
        if (this._assetManager.getState() === jsb.AssetsManager.State.UNINITED) {
            // Resolve md5 url
            var url = this.manifestUrl.nativeUrl;
            if (cc.loader.md5Pipe) {
                url = cc.loader.md5Pipe.transformURL(url);
            }
            console.log("清单文件地址:", url);
            this._assetManager.loadLocalManifest(url);
        }
    }


    /**
     * 进行热更新
     */
    private hotUpdate() {
        console.log("进行热更新");
        console.log(this._assetManager, this._updating);
        if (this._assetManager && !this._updating) {
            this._assetManager.setEventCallback(this.updateCb.bind(this));
            // load对应清单文件
            this.loadLocalManifest();
            // this._failCount = 0;
            this._assetManager.update();
            this._updating = true;
        }
    }


    /**
     * //设置你自己的版本比较处理器，版本和B是字符串版本
     * //如果返回值大于0,versionA大于B
     * //如果返回值为0,versionA等于B
     * //如果返回值小于0，则versionA小于B
     * @param versionA 
     * @param versionB 
     */
    private versionCompareHandle(versionA, versionB) {
        if (versionA == versionB) return 0;
        // cc.log("JS Custom Version Compare: version A is " + versionA + ', version B is ' + versionB);
        var vA = versionA.split('.');
        var vB = versionB.split('.');
        for (var i = 0; i < vA.length; ++i) {
            var a = parseInt(vA[i]);
            var b = parseInt(vB[i] || 0);
            if (a === b) { continue; }
            else { return a - b; }
        }
        if (vB.length > vA.length) { return -1; }
        else { return 0; }
    };


    /**
     * //设置验证回调，但我们还没有md5检查函数，所以只打印一些消息
     * //如果验证通过，返回true，否则返回false
     */
    private assetsVerify(path, asset) {
        var compressed = asset.compressed;
        var expectedMD5 = asset.md5;
        var relativePath = asset.path;
        if (compressed) {
            console.log("验证通过了 : " + relativePath);
            return true;
        }
        else {
            console.log("验证通过了 : " + relativePath + ' (' + expectedMD5 + ')');
            return true;
        }
    }

    update(dt?: number) {
    }

    onDestroy() {
        this._assetManager && this._assetManager.setEventCallback(null);
    }

}
