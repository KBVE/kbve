<script lang="ts" context="module">
        declare global {
            interface Window {
                sitekey: string;
                hcaptchaOnLoad: Function;
                onSuccess: Function;
                onError: Function;
                onClose: Function;
                onExpired: Function;
                hcaptcha: any;
            }
        }
</script>

<script lang="ts">
        import { kbveLocker } from '../../../core';
</script>