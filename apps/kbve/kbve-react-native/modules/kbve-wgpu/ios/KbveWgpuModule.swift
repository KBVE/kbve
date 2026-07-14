import ExpoModulesCore

public class KbveWgpuModule: Module {
    public func definition() -> ModuleDefinition {
        Name("KbveWgpuModule")

        Function("setJwt") { (jwt: String) in
            KbveWgpuView.current?.setJwt(jwt)
        }

        Function("goOnline") { (serverUrl: String, jwt: String) in
            KbveWgpuView.current?.goOnline(serverUrl, jwt)
        }

        Function("hostResponse") { (id: Int, ok: Bool, payload: String) in
            KbveWgpuView.current?.hostResponse(id: id, ok: ok, payload: payload)
        }

        Function("pointer") { (kind: Int, x: Double, y: Double) in
            KbveWgpuView.current?.pointer(kind, x, y)
        }

        View(KbveWgpuView.self) {
            Events("onReady", "onHostCall")
            Prop("componentId") { (view: KbveWgpuView, value: String) in
                view.componentId = value
            }
        }
    }
}
