import asyncio
import logging
import traceback
from typing import Optional

from langchain_core.runnables import RunnableConfig

logger = logging.getLogger(__name__)

async def astream(llm, messages, extra_body, config: Optional[RunnableConfig], retry_cnt = 5):
    # Fast-fail if TTFB exceeds threshold to avoid waiting full client timeout per retry
    TTFB_TIMEOUT_SECONDS = 100
    PER_CHUNK_IDLE_TIMEOUT_SECONDS = 100
    
    try:
        stream = llm.astream(input=messages, extra_body=extra_body, config=config)
        aiter = stream.__aiter__()
        
        try:
            first_chunk = await asyncio.wait_for(aiter.__anext__(), timeout=TTFB_TIMEOUT_SECONDS)
        except asyncio.TimeoutError as timeout_err:
            # TimeoutError should NOT retry - fast fail as designed
            error_msg = f"TTFB exceeded {TTFB_TIMEOUT_SECONDS}s without receiving first token"
            logger.error(error_msg)
            raise TimeoutError(error_msg) from timeout_err

        result = first_chunk

        # Continue consuming the remaining chunks with per-chunk idle timeout
        while True:
            try:
                chunk = await asyncio.wait_for(aiter.__anext__(), timeout=PER_CHUNK_IDLE_TIMEOUT_SECONDS)
            except StopAsyncIteration:
                break
            except asyncio.TimeoutError as timeout_err:
                # TimeoutError should NOT retry - fast fail as designed
                error_msg = f"Stream stalled: no chunk for {PER_CHUNK_IDLE_TIMEOUT_SECONDS}s after TTFB"
                logger.error(error_msg)
                raise TimeoutError(error_msg) from timeout_err

            result = result + chunk
        return result
    except TimeoutError:
        # Don't retry on timeout - re-raise immediately for fast-fail behavior
        raise
    except Exception as e:
        error_msg = traceback.format_exc()
        logger.error(f"Request failed: {error_msg}, {retry_cnt} retries remaining")
        if retry_cnt > 0:
            await asyncio.sleep(3)
            return await astream(llm, messages, extra_body, config, retry_cnt - 1)
        else:
            raise