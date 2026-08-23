"""The per-session bus, without HTTP or a database."""

from uuid import uuid4

import pytest

from backend.streaming.bus import EventBus, SessionGone, SubscriberLagging
from shared.events import AssistantText, Event


def event(session_id, seq, text="hello"):
    return Event(session_id=session_id, seq=seq, payload=AssistantText(text=text))


async def test_a_subscriber_receives_what_is_published():
    bus = EventBus()
    session_id = uuid4()

    async with bus.subscribe(session_id) as subscription:
        bus.publish(event(session_id, 0))
        received = await subscription.next_event()

    assert received.seq == 0
    assert received.payload.text == "hello"


async def test_events_do_not_leak_across_sessions():
    bus = EventBus()
    watched, other = uuid4(), uuid4()

    async with bus.subscribe(watched) as subscription:
        bus.publish(event(other, 0, "secret"))
        bus.publish(event(watched, 0, "mine"))
        received = await subscription.next_event()

    assert received.payload.text == "mine"


async def test_each_subscriber_gets_its_own_copy():
    bus = EventBus()
    session_id = uuid4()

    async with (
        bus.subscribe(session_id) as first,
        bus.subscribe(session_id) as second,
    ):
        bus.publish(event(session_id, 0))
        assert (await first.next_event()).seq == 0
        assert (await second.next_event()).seq == 0


async def test_leaving_clears_the_subscriber():
    bus = EventBus()
    session_id = uuid4()

    async with bus.subscribe(session_id):
        assert bus.subscriber_count(session_id) == 1

    assert bus.subscriber_count(session_id) == 0


async def test_a_full_queue_marks_the_subscriber_as_lagging():
    bus = EventBus(maxsize=2)
    session_id = uuid4()

    async with bus.subscribe(session_id) as subscription:
        bus.publish(event(session_id, 0))
        bus.publish(event(session_id, 1))
        bus.publish(event(session_id, 2))

        with pytest.raises(SubscriberLagging):
            await subscription.next_event()


async def test_closing_a_session_ends_its_subscribers():
    bus = EventBus()
    session_id = uuid4()

    async with bus.subscribe(session_id) as subscription:
        bus.close(session_id)
        with pytest.raises(SessionGone):
            await subscription.next_event()


async def test_an_idle_wait_times_out_as_none():
    bus = EventBus()
    session_id = uuid4()

    async with bus.subscribe(session_id) as subscription:
        assert await subscription.next_event(idle=0.01) is None
