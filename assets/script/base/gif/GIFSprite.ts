import Base from "../Base";
import TimerComponent from "../components/TimerComponent";
import GIF from "./GIF";

// Learn TypeScript:
//  - [Chinese] http://docs.cocos.com/creator/manual/zh/scripting/typescript.html
//  - [English] http://www.cocos2d-x.org/docs/creator/manual/en/scripting/typescript.html
// Learn Attribute:
//  - [Chinese] http://docs.cocos.com/creator/manual/zh/scripting/reference/attributes.html
//  - [English] http://www.cocos2d-x.org/docs/creator/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - [Chinese] http://docs.cocos.com/creator/manual/zh/scripting/life-cycle-callbacks.html
//  - [English] http://www.cocos2d-x.org/docs/creator/manual/en/scripting/life-cycle-callbacks.html

const { ccclass, property, requireComponent, disallowMultiple, executeInEditMode } = cc._decorator;

@ccclass
@executeInEditMode
@disallowMultiple
@requireComponent(cc.Sprite)
export default class GIFSprite extends cc.Component {

    @property({ visible: false })
    private _path: cc.RawAsset = null;
    _oldTime: number;

    @property({ type: cc.RawAsset })
    set path(path) {
        if (!path || (path && path.toString().length == 0)) {
            return;
        }
        this._path = path;
        this.clear();
        console.time("AAABBB");
        this.applayChange();
        console.timeEnd("AAABBB");
    }
    get path() { return this._path; }

    public sprite: cc.Sprite = null;

    public _inited: boolean;

    private _defaultSpriteFrame: cc.SpriteFrame;
    private _gif: GIF;
    private _action: cc.ActionInterval;
    private _delays: Array<number>;
    private _index: number = 0;
    private _spriteFrames: Array<cc.SpriteFrame>;



    protected onLoad() {
        this.sprite = this.node.getComponent(cc.Sprite);
        this._defaultSpriteFrame = this.sprite.spriteFrame;
    }

    protected start() {
        this.applayChange();
    }

    protected onDestroy() {
        this.sprite.spriteFrame = this._defaultSpriteFrame;
    }

    protected update(dt) {
        // console.log("update(dt):" + (new Date().getTime() - this._oldTime) + "ms");
        this._oldTime = new Date().getTime();
    }

    public setDefaultSpriteFrame(spriteFrame) {
        console.log("setDefaultSpriteFrame", spriteFrame);
        this.sprite.spriteFrame = spriteFrame, true;
    }

    private inited() {
        this._gif = null;
        this._index = 0;
        this._inited = true;
        this._action = cc.repeatForever(
            cc.sequence(
                [
                    cc.delayTime(this._delays[this._index % this._spriteFrames.length] * 10 / 1000 > 0.02 ? this._delays[this._index % this._spriteFrames.length] * 10 / 1000 : 0.02), cc.callFunc(
                        function () {
                            this.sprite.spriteFrame = this._spriteFrames[this._index++ % this._spriteFrames.length], true;
                        }.bind(this)
                    )
                ]
            )
        );
        this.node.runAction(this._action.clone());
    }

    private async applayChange() {
        console.log("applayChange");
        cc.loader.load(this.path.toString(), function (err, result) {
            let gifMessage: GIFMessage = {
                target: this,
                buffer: result.buffer,
                initOneSpriteFrameFunc: function (spriteFrame) {
                    this.setDefaultSpriteFrame(spriteFrame);
                }.bind(this),
                initFinishedFunc: function (data) {
                    this._delays = data.delays;
                    this._spriteFrames = data.spriteFrames;
                    console.log("initFinishedFunc", this._delays, this._spriteFrames);
                    this.inited();
                }.bind(this)
            }
            this._gif = new GIF(gifMessage);
        }.bind(this));
    }

    private clear() {
        this.node.stopAllActions();
        this._gif = null;
        this._index = 0;
        this._inited = null;
        this._delays = null;
        this._spriteFrames = null;
    }

}

export interface GIFMessage {
    target: GIFSprite,
    buffer: ArrayBuffer,
    initOneSpriteFrameFunc: { (spriteFrame: cc.SpriteFrame) },
    initFinishedFunc: {
        (
            data: {
                delays: Array<number>,
                spriteFrames: Array<cc.SpriteFrame>
            }
        )
    }
}