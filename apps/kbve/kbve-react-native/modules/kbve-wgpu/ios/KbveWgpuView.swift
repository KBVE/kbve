import ExpoModulesCore
import KbveWgpuFFI
import QuartzCore
import UIKit

public final class KbveWgpuView: ExpoView {
    static weak var current: KbveWgpuView?

    let onReady = EventDispatcher()
    let onHostCall = EventDispatcher()

    var componentId: String = ""

    private let metalLayer = CAMetalLayer()
    private var displayLink: CADisplayLink?
    private var surface: OpaquePointer?
    private var pendingJwt: String?

    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        clipsToBounds = true
        metalLayer.pixelFormat = .bgra8Unorm
        metalLayer.framebufferOnly = true
        metalLayer.contentsScale = UIScreen.main.scale
        KbveWgpuView.current = self
    }

    private var isGameMode: Bool { componentId != "triangle" }

    private static func assetRoot() -> String {
        let bundle = Bundle(for: KbveWgpuView.self)
        if let url = bundle.url(forResource: "KbveWgpuAssets", withExtension: "bundle"),
            let assets = Bundle(url: url) {
            return assets.resourcePath ?? assets.bundlePath
        }
        return bundle.resourcePath ?? "assets"
    }

    public override func layoutSubviews() {
        super.layoutSubviews()
        metalLayer.frame = bounds
        let scale = window?.screen.scale ?? UIScreen.main.scale
        let width = UInt32(max(bounds.width * scale, 1))
        let height = UInt32(max(bounds.height * scale, 1))
        metalLayer.drawableSize = CGSize(width: CGFloat(width), height: CGFloat(height))

        if surface == nil {
            createSurface(width: width, height: height)
        } else {
            kbve_wgpu_resize(surface, width, height)
        }
    }

    private func createSurface(width: UInt32, height: UInt32) {
        if isGameMode {
            let raw = Unmanaged.passUnretained(self).toOpaque()
            let root = Array(Self.assetRoot().utf8)
            surface = root.withUnsafeBufferPointer { ptr in
                kbve_wgpu_create_game(raw, 2, width, height, ptr.baseAddress, root.count)
            }
        } else {
            if metalLayer.superlayer == nil {
                layer.addSublayer(metalLayer)
            }
            let raw = Unmanaged.passUnretained(metalLayer).toOpaque()
            surface = kbve_wgpu_create(raw, 0, width, height)
        }
        let ok = surface != nil
        if ok {
            if let jwt = pendingJwt {
                applyJwt(jwt)
                pendingJwt = nil
            }
            startLoop()
        }
        onReady(["ok": ok])
    }

    private func startLoop() {
        let link = CADisplayLink(target: self, selector: #selector(tick))
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    @objc private func tick() {
        guard let surface = surface else { return }
        let status = kbve_wgpu_render(surface)
        if status == 1 {
            recreate()
        }
    }

    private func recreate() {
        kbve_wgpu_destroy(surface)
        surface = nil
        setNeedsLayout()
    }

    func setJwt(_ jwt: String) {
        if surface == nil {
            pendingJwt = jwt
            return
        }
        applyJwt(jwt)
    }

    private func applyJwt(_ jwt: String) {
        let bytes = Array(jwt.utf8)
        bytes.withUnsafeBufferPointer { ptr in
            kbve_wgpu_set_jwt(surface, ptr.baseAddress, bytes.count)
        }
    }

    func goOnline(_ serverUrl: String, _ jwt: String) {
        setJwt(jwt)
    }

    func hostResponse(id: Int, ok: Bool, payload: String) {}

    private func forwardTouch(_ touches: Set<UITouch>, kind: UInt32) {
        guard let surface = surface, let touch = touches.first else { return }
        let scale = window?.screen.scale ?? UIScreen.main.scale
        let point = touch.location(in: self)
        let event = FfiInputEvent(
            kind: kind,
            x: Float(point.x * scale),
            y: Float(point.y * scale),
            id: 0
        )
        kbve_wgpu_input(surface, event)
    }

    public override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        forwardTouch(touches, kind: 0)
    }

    public override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        forwardTouch(touches, kind: 1)
    }

    public override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        forwardTouch(touches, kind: 2)
    }

    public override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        forwardTouch(touches, kind: 2)
    }

    public override func willMove(toWindow newWindow: UIWindow?) {
        super.willMove(toWindow: newWindow)
        let paused = newWindow == nil
        if let surface = surface {
            kbve_wgpu_pause(surface, paused)
        }
        displayLink?.isPaused = paused
    }

    deinit {
        displayLink?.invalidate()
        if let surface = surface {
            kbve_wgpu_destroy(surface)
        }
    }
}
