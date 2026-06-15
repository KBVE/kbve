package expo.modules.kbvewgpu

import android.content.Context
import android.view.Choreographer
import android.view.MotionEvent
import android.view.SurfaceHolder
import android.view.SurfaceView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import expo.modules.kotlin.viewevent.EventDispatcher

class KbveWgpuView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext), SurfaceHolder.Callback, Choreographer.FrameCallback {

  companion object {
    var current: KbveWgpuView? = null
    init {
      System.loadLibrary("kbve_wgpu")
    }
  }

  private external fun nativeCreate(surface: android.view.Surface, width: Int, height: Int): Long
  private external fun nativeCreateGame(
    surface: android.view.Surface,
    width: Int,
    height: Int,
    assetRoot: String,
  ): Long
  private external fun nativeRender(ptr: Long): Int
  private external fun nativeResize(ptr: Long, width: Int, height: Int)
  private external fun nativeInput(ptr: Long, kind: Int, x: Float, y: Float, id: Int)
  private external fun nativeDestroy(ptr: Long)

  private val isGameMode: Boolean get() = componentId != "triangle"

  private fun extractAssets(): String {
    val out = java.io.File(context.filesDir, "kbve_assets")
    if (!out.exists()) {
      copyAsset("kbve_assets", out)
    }
    return out.absolutePath
  }

  private fun copyAsset(path: String, dest: java.io.File) {
    val children = context.assets.list(path) ?: arrayOf()
    if (children.isEmpty()) {
      dest.parentFile?.mkdirs()
      context.assets.open(path).use { input ->
        java.io.FileOutputStream(dest).use { input.copyTo(it) }
      }
    } else {
      dest.mkdirs()
      for (child in children) copyAsset("$path/$child", java.io.File(dest, child))
    }
  }

  private val onReady by EventDispatcher()
  private val onHostCall by EventDispatcher()

  var componentId: String = ""
  private var surfacePtr: Long = 0L
  private var pendingJwt: String? = null

  private val surfaceView = SurfaceView(context).also {
    it.holder.addCallback(this)
    addView(it)
  }

  init {
    current = this
  }

  override fun surfaceCreated(holder: SurfaceHolder) {}

  override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
    if (surfacePtr == 0L) {
      surfacePtr = if (isGameMode) {
        nativeCreateGame(holder.surface, width, height, extractAssets())
      } else {
        nativeCreate(holder.surface, width, height)
      }
      val ok = surfacePtr != 0L
      if (ok) {
        Choreographer.getInstance().postFrameCallback(this)
      }
      onReady(mapOf("ok" to ok))
    } else {
      nativeResize(surfacePtr, width, height)
    }
  }

  override fun surfaceDestroyed(holder: SurfaceHolder) {
    Choreographer.getInstance().removeFrameCallback(this)
    if (surfacePtr != 0L) {
      nativeDestroy(surfacePtr)
      surfacePtr = 0L
    }
  }

  override fun doFrame(frameTimeNanos: Long) {
    if (surfacePtr != 0L) {
      val status = nativeRender(surfacePtr)
      if (status == 1) {
        surfaceView.holder.surface?.let { /* surface lost: recreated on next surfaceChanged */ }
      }
      Choreographer.getInstance().postFrameCallback(this)
    }
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (surfacePtr == 0L) return false
    val kind = when (event.actionMasked) {
      MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> 0
      MotionEvent.ACTION_MOVE -> 1
      MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP, MotionEvent.ACTION_CANCEL -> 2
      else -> return false
    }
    nativeInput(surfacePtr, kind, event.x, event.y, event.getPointerId(0))
    return true
  }

  fun setJwt(jwt: String) {
    pendingJwt = jwt
  }

  fun goOnline(serverUrl: String, jwt: String) {
    setJwt(jwt)
  }

  fun hostResponse(id: Int, ok: Boolean, payload: String) {}
}
