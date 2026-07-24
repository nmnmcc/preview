import {
  preview as corePreview,
  type ComponentPreviewDefinition,
  type Preview,
  type PreviewDone,
  type PreviewEmit,
} from "@nmnmcc/preview";
import {
  mount,
  unmount,
  type Component,
  type ComponentProps,
  type MountOptions,
} from "svelte";

// Svelte uses this same bound for helpers which infer a component's props.
type SvelteComponent = Component<any>;

export interface SveltePreviewOptions<TComponent extends SvelteComponent>
  extends Preview.PreviewMetadata {
  readonly component: TComponent;
  readonly props: (options: {
    readonly emit: PreviewEmit;
    readonly done: PreviewDone;
  }) => ComponentProps<TComponent>;
  readonly context?: MountOptions<ComponentProps<TComponent>>["context"];
}

export const preview = <TComponent extends SvelteComponent>(
  options: SveltePreviewOptions<TComponent>,
): ComponentPreviewDefinition => {
  const { component, context, props, ...metadata } = options;
  return corePreview({
    ...metadata,
    mount: ({ root, emit, done }) => {
      const mounted = mount(component, {
        target: root,
        props: props({ emit, done }),
        ...(context === undefined ? {} : { context }),
      });
      return () => unmount(mounted);
    },
  });
};
