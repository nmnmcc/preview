import {
  preview as corePreview,
  type ComponentPreviewDefinition,
  type Preview,
  type PreviewReady,
} from "@nmnmcc/preview";
import {
  type Component,
  type ComponentProps,
  type MountOptions,
  mount,
  unmount,
} from "svelte";

// Svelte uses this same bound for helpers which infer a component's props.
type SvelteComponent = Component<any>;

export interface SveltePreviewOptions<
  TComponent extends SvelteComponent,
> extends Preview.PreviewMetadata {
  readonly component: TComponent;
  readonly props: (options: {
    readonly ready: PreviewReady;
  }) => ComponentProps<TComponent>;
  readonly context?: MountOptions<
    ComponentProps<TComponent>
  >["context"];
}

export const preview = <TComponent extends SvelteComponent>(
  options: SveltePreviewOptions<TComponent>,
): ComponentPreviewDefinition => {
  const { component, context, props, ...metadata } = options;
  return corePreview({
    ...metadata,
    mount: ({ root, ready }) => {
      const mounted = mount(component, {
        target: root,
        props: props({ ready }),
        ...(context === undefined ? {} : { context }),
      });
      return () => unmount(mounted);
    },
  });
};
