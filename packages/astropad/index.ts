// Do not write code directly here, instead use the `src` folder!

// @ts-ignore TypeScript doesn't know about Astro files
export { default as Astropad } from './src/Astropad.astro';

export { default as AstroPadResume } from './src/resume/AstroPadResume.astro';

export { default as AdsenseArticle } from './src/adsense/AdsenseArticle.astro';
export { default as Adsense } from './src/adsense/Adsense.astro';
export { default as Giscus } from './src/giscus/Giscus.astro';

//  [Panels]
export { default as AstroNeoGlassPanel } from './src/neoglass/EntityNeoGlassPanel.astro';

//  [Lottie]
export { default as AstroLottie } from './src/lottie/EntityLottie.astro';

//  [Supabase]
export { supabase } from './src/supabase/states/supabaseClient';
export { userClientService } from './src/supabase/states/userClient';

//  [Auth Services]
export { loginService } from './src/supabase/auth/login/ServiceLogin';
export { oauthService } from './src/supabase/auth/oauth/ServiceOAuth';
export { registerService } from './src/supabase/auth/register/ServiceRegister';
export { logoutService } from './src/supabase/auth/logout/ServiceLogout';
//  [User Service]
export { userProfileService } from './src/supabase/users/profile/ServiceUserProfile'; 

//  [React Auth Components]
export { ReactLogin } from './src/supabase/auth/login/ReactLogin';
export { ReactOAuth } from './src/supabase/auth/oauth/ReactOAuth';
export { ReactCallback } from './src/supabase/auth/oauth/ReactCallback';
export { ReactCallbackProfessional } from './src/supabase/auth/oauth/ReactCallbackProfessional';
export { ReactCallbackSimple } from './src/supabase/auth/oauth/ReactCallbackSimple';
export { ReactRegister } from './src/supabase/auth/register/ReactRegister';
export { ReactLogout } from './src/supabase/auth/logout/ReactLogout';
export { ReactUserProfile } from './src/supabase/users/profile/ReactUserProfile';

//  [Card]
export { default as AstroHolyCard } from './src/card/holycard/EntityHolyCard.astro';

//  [Astro OAuth Components]
export { default as AstroOAuth } from './src/supabase/auth/oauth/EntityOAuth.astro';
export { default as AstroCallback } from './src/supabase/auth/oauth/EntityCallback.astro';
export { default as AstroLogin } from './src/supabase/auth/login/EntityLogin.astro';
export { default as AstroRegister } from './src/supabase/auth/register/EntityRegister.astro';
export { default as AstroLogout } from './src/supabase/auth/logout/EntityLogout.astro';
//  [Astro User Components]
export { default as AstroUserProfile } from './src/supabase/users/profile/EntityUserProfile.astro';

//  [ConchShell]
export { default as ConchShell } from './src/conchshell/ConchShell.astro';

export { default as DevCode } from './src/devcode/DevCode.astro';

export { default as BentoGridService } from './src/bentogrid/services/BentoGridService.astro';


export { default as Preline } from './src/utils/Preline.astro';

export { default as ItemDB } from './src/itemdb/ItemDBTable.astro';

export { default as Tasks } from './src/tasks/Tasks.astro';
export { default as ArchivedTasks } from './src/tasks/ArchiveTasks.astro';

//  [Toast]
export { default as Toastify} from './src/toastify/AstroToastify.astro';

//  [Rive]
export { default as AstroRive } from './src/rive/AstroRive.astro';

//  [Register]
// export { default as SupabaseRegister } from './src/register/supabase/SupabaseRegister.astro';

// export { default as Register } from './src/register/Register.astro';
// Login
// export { default as Login } from './src/login/Login.astro';