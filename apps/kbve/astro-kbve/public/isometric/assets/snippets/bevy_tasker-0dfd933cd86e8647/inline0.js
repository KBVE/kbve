
        export function atomics_wait_async(buf, index, value) {
            return Atomics.waitAsync(buf, index, value);
        }
        export function wait_result_async(result) {
            return result.async;
        }
        export function wait_result_value(result) {
            return result.value;
        }
    