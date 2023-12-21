<script lang="ts">

    import { kbve$ } from '../../storage';

</script>


<div class="px-4 py-3">
    <span class="block text-sm text-white">Guest</span>
    <span class="block text-sm truncate text-zinc-400">
        {$kbve$.email}
    </span>
</div>
<ul class="py-2" aria-labelledby="user-menu-button">
    <li>
        <a
            href="/#"
            class="block px-4 py-2 text-sm hover:bg-zinc-600 text-zinc-200 hover:text-white">
            Dashboard
        </a>
    </li>
    <li>
        <a
            href="/#"
            class="block px-4 py-2 text-sm hover:bg-zinc-600 text-zinc-200 hover:text-white">
            Settings
        </a>
    </li>
    <li>
        <a
            href="/#"
            class="block px-4 py-2 text-sm hover:bg-zinc-600 text-zinc-200 hover:text-white">
            Earnings
        </a>
    </li>
    <li>
        <a
            href="/#"
            class="block px-4 py-2 text-sm hover:bg-zinc-600 text-zinc-200 hover:text-white">
            Sign out
        </a>
    </li>
</ul>