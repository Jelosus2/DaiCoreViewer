import { Animation, MixBlend, TranslateTimeline, TranslateXTimeline, TranslateYTimeline} from "@esotericsoftware/spine-pixi-v8";

const preparedAnimations = new WeakMap<Animation, Animation>();

export function prepareIdleTransitionAnimation(animation: Animation): Animation {
    const existing = preparedAnimations.get(animation);
    if (existing)
        return existing;

    const timelines = animation.timelines.map((timeline) => {
        if (
            !(timeline instanceof TranslateTimeline || timeline instanceof TranslateXTimeline || timeline instanceof TranslateYTimeline) ||
            timeline.frames[0] <= 0
        )
        {
            return timeline;
        }

        const prepared = Object.assign(Object.create(Object.getPrototypeOf(timeline)), timeline) as typeof timeline;

        prepared.apply = (...args: Parameters<typeof timeline.apply>) => {
            // Prepare late position keys through the action's existing fade-in.
            // Keep attachment, color, event, and draw-order timelines unchanged.
            if (args[2] < timeline.frames[0] && args[5] === MixBlend.replace)
                args[5] = MixBlend.first;

            timeline.apply(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
        };

        return prepared;
    });

    const prepared = new Animation(animation.name, timelines, animation.duration);

    preparedAnimations.set(animation, prepared);
    return prepared;
}
