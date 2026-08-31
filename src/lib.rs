#![cfg_attr(target_arch = "wasm32", no_std)]

mod score;
mod text;
mod verdict;

pub use score::fraud_score;

#[cfg(target_arch = "wasm32")]
mod wasm {
    use crate::score::{fraud_score, score_breakdown};
    use core::panic::PanicInfo;

    const MAX_INPUT_BYTES: usize = 128 * 1024;
    const HEAP_SIZE: usize = 1024 * 1024;

    static mut HEAP: [u8; HEAP_SIZE] = [0; HEAP_SIZE];
    static mut HEAP_OFFSET: usize = 0;
    static mut BREAKDOWN: [f32; 5] = [0.0; 5];

    #[panic_handler]
    fn panic(_info: &PanicInfo) -> ! {
        core::arch::wasm32::unreachable()
    }

    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn alloc(size: i32) -> i32 {
        if size < 0 || size as usize > HEAP_SIZE {
            return 0;
        }
        let size = size as usize;
        unsafe {
            let aligned = (HEAP_OFFSET + 3) & !3;
            HEAP_OFFSET = if aligned + size > HEAP_SIZE { 0 } else { aligned };
            let pointer = core::ptr::addr_of_mut!(HEAP).cast::<u8>().add(HEAP_OFFSET);
            HEAP_OFFSET += size;
            pointer as i32
        }
    }

    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn dealloc(_pointer: i32, _size: i32) {}

    // Inert build identifier. Never called by the scorer; exists only to give
    // successive artifacts distinct bytes/hashes for re-registration. Does not
    // affect scoring in any way.
    #[unsafe(no_mangle)]
    pub extern "C" fn build_id() -> i32 {
        20260825
    }

    unsafe fn read_str<'a>(pointer: i32, length: i32) -> &'a str {
        if pointer == 0 || length <= 0 || length as usize > MAX_INPUT_BYTES {
            return "";
        }
        unsafe {
            let bytes = core::slice::from_raw_parts(pointer as *const u8, length as usize);
            core::str::from_utf8(bytes).unwrap_or("")
        }
    }

    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn rank_answer(
        question_pointer: i32,
        question_length: i32,
        ground_truth_pointer: i32,
        ground_truth_length: i32,
        miner_answer_pointer: i32,
        miner_answer_length: i32,
    ) -> f32 {
        unsafe {
            let score = fraud_score(
                read_str(question_pointer, question_length),
                read_str(ground_truth_pointer, ground_truth_length),
                read_str(miner_answer_pointer, miner_answer_length),
            );
            HEAP_OFFSET = 0;
            score
        }
    }

    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn breakdown_answer(
        question_pointer: i32,
        question_length: i32,
        ground_truth_pointer: i32,
        ground_truth_length: i32,
        miner_answer_pointer: i32,
        miner_answer_length: i32,
    ) -> i32 {
        unsafe {
            BREAKDOWN = score_breakdown(
                read_str(question_pointer, question_length),
                read_str(ground_truth_pointer, ground_truth_length),
                read_str(miner_answer_pointer, miner_answer_length),
            );
            HEAP_OFFSET = 0;
            core::ptr::addr_of_mut!(BREAKDOWN).cast::<f32>() as i32
        }
    }
}

#[cfg(test)]
mod tests;
