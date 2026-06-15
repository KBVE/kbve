Pod::Spec.new do |s|
  s.name           = 'KbveWgpu'
  s.version        = '0.1.0'
  s.summary        = 'KBVE native wgpu render surface'
  s.description    = 'Native Metal/wgpu surface mounted as a React Native Fabric view.'
  s.author         = 'KBVE'
  s.homepage       = 'https://kbve.com'
  s.platforms      = { :ios => '15.1', :tvos => '15.1' }
  s.source         = { :git => 'https://github.com/KBVE/kbve.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files       = '*.swift'
  s.vendored_frameworks = 'kbve_wgpu.xcframework'
  s.preserve_paths     = 'include/**/*', 'kbve_wgpu.xcframework'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_INCLUDE_PATHS' => '$(PODS_TARGET_SRCROOT)/include',
    'OTHER_LDFLAGS' => '-framework Metal -framework QuartzCore'
  }
end
