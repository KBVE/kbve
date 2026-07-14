package expo.modules.kbvewgpu

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KbveWgpuModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KbveWgpuModule")

    Function("setJwt") { jwt: String ->
      KbveWgpuView.current?.setJwt(jwt)
    }

    Function("goOnline") { serverUrl: String, jwt: String ->
      KbveWgpuView.current?.goOnline(serverUrl, jwt)
    }

    Function("hostResponse") { id: Int, ok: Boolean, payload: String ->
      KbveWgpuView.current?.hostResponse(id, ok, payload)
    }

    Function("pointer") { kind: Int, x: Double, y: Double ->
      KbveWgpuView.current?.pointer(kind, x, y)
    }

    View(KbveWgpuView::class) {
      Events("onReady", "onHostCall")
      Prop("componentId") { view: KbveWgpuView, value: String ->
        view.componentId = value
      }
    }
  }
}
