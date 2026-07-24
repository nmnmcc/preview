import {
  PreviewCollection,
  type PreviewDefinition,
  type PreviewTemplate,
} from "./preview";
import { PreviewNamePartPattern } from "./schema";

export type PreviewMatrixValue = string | number | boolean;

export type PreviewMatrixAxis = readonly [
  PreviewMatrixValue,
  ...ReadonlyArray<PreviewMatrixValue>,
];

export type PreviewMatrixAxes = Readonly<Record<string, PreviewMatrixAxis>>;

export type PreviewMatrixAxisInput<Axes extends PreviewMatrixAxes> = {
  readonly [Axis in keyof Axes]: Axes[Axis][number];
};

export type PreviewMatrixInclude<Axes extends PreviewMatrixAxes> = Readonly<
  Record<string, { readonly [Axis in keyof Axes]: PreviewMatrixValue }>
>;

export type PreviewMatrixInput<
  Axes extends PreviewMatrixAxes,
  Include extends PreviewMatrixInclude<Axes> = {},
> = PreviewMatrixAxisInput<Axes> | Include[keyof Include];

export type PreviewMatrixExclude<Axes extends PreviewMatrixAxes> = Readonly<
  Partial<PreviewMatrixAxisInput<Axes>>
>;

export interface PreviewMatrixConfig<
  Axes extends PreviewMatrixAxes,
  Include extends PreviewMatrixInclude<Axes> = {},
> {
  readonly axes: Axes;
  readonly exclude?: ReadonlyArray<PreviewMatrixExclude<Axes>>;
  readonly include?: Include;
}

const fail = (detail: string): never => {
  throw new TypeError(`Invalid preview matrix: ${detail}`);
};

const isMatrixValue = (input: unknown): input is PreviewMatrixValue =>
  typeof input === "string" ||
  typeof input === "number" ||
  typeof input === "boolean";

const valueName = (value: PreviewMatrixValue): string => {
  if (
    typeof value === "number" &&
    (!Number.isSafeInteger(value) || value < 0)
  ) {
    return fail(
      `axis number ${String(value)} must be a non-negative safe integer.`,
    );
  }
  const name = String(value);
  if (!PreviewNamePartPattern.test(name)) {
    return fail(
      `axis value ${JSON.stringify(name)} must use only letters, numbers, "_", or "-".`,
    );
  }
  return name;
};

interface RuntimeCombination {
  readonly input: Readonly<Record<string, PreviewMatrixValue>>;
  readonly nameParts: ReadonlyArray<string>;
}

const validateAxes = (
  axes: PreviewMatrixAxes,
): ReadonlyArray<readonly [string, PreviewMatrixAxis]> => {
  const entries = Object.entries(axes);
  if (entries.length === 0) return fail("axes must not be empty.");

  for (const [axis, values] of entries) {
    if (!PreviewNamePartPattern.test(axis)) {
      return fail(
        `axis name ${JSON.stringify(axis)} must use only letters, numbers, "_", or "-".`,
      );
    }
    if (!Array.isArray(values) || values.length === 0) {
      return fail(`axis ${JSON.stringify(axis)} must have at least one value.`);
    }
    const names = new Set<string>();
    for (const value of values) {
      if (!isMatrixValue(value)) {
        return fail(
          `axis ${JSON.stringify(axis)} contains a value that is not a string, number, or boolean.`,
        );
      }
      const name = valueName(value);
      if (names.has(name)) {
        return fail(
          `axis ${JSON.stringify(axis)} has more than one value named ${JSON.stringify(name)}.`,
        );
      }
      names.add(name);
    }
  }

  return entries;
};

const validateExclude = (
  axes: ReadonlyArray<readonly [string, PreviewMatrixAxis]>,
  exclude: ReadonlyArray<Readonly<Record<string, PreviewMatrixValue>>>,
): void => {
  const valuesByAxis = new Map(axes);
  for (const entry of exclude) {
    const fields = Object.entries(entry);
    if (fields.length === 0) {
      fail("exclude entries must name at least one axis.");
    }
    for (const [axis, value] of fields) {
      const values = valuesByAxis.get(axis);
      if (values === undefined) {
        return fail(`exclude references unknown axis ${JSON.stringify(axis)}.`);
      }
      if (!values.some((candidate) => Object.is(candidate, value))) {
        fail(
          `exclude references unknown value ${JSON.stringify(value)} for axis ${JSON.stringify(axis)}.`,
        );
      }
    }
  }
};

const validateInclude = (
  axes: ReadonlyArray<readonly [string, PreviewMatrixAxis]>,
  include: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): void => {
  const axisNames = axes.map(([axis]) => axis);
  for (const [name, input] of Object.entries(include)) {
    if (!PreviewNamePartPattern.test(name)) {
      fail(
        `included variant name ${JSON.stringify(name)} must use only letters, numbers, "_", or "-".`,
      );
    }
    const inputNames = Object.keys(input);
    if (
      inputNames.length !== axisNames.length ||
      axisNames.some((axis) => !Object.hasOwn(input, axis))
    ) {
      fail(
        `included variant ${JSON.stringify(name)} must set every matrix axis and no other fields.`,
      );
    }
    for (const value of Object.values(input)) {
      if (!isMatrixValue(value)) {
        fail(
          `included variant ${JSON.stringify(name)} contains a value that is not a string, number, or boolean.`,
        );
      }
    }
  }
};

const isExcluded = (
  combination: RuntimeCombination,
  exclude: ReadonlyArray<Readonly<Record<string, PreviewMatrixValue>>>,
): boolean =>
  exclude.some((entry) =>
    Object.entries(entry).every(([axis, value]) =>
      Object.is(combination.input[axis], value),
    ),
  );

export const matrix = <
  const Axes extends PreviewMatrixAxes,
  const Include extends PreviewMatrixInclude<Axes> = {},
>(
  config: PreviewMatrixConfig<Axes, Include>,
  base: PreviewTemplate<PreviewMatrixInput<Axes, Include>>,
): PreviewCollection => {
  const axes = validateAxes(config.axes);
  const exclude = (config.exclude ?? []) as ReadonlyArray<
    Readonly<Record<string, PreviewMatrixValue>>
  >;
  validateExclude(axes, exclude);

  const include = (config.include ?? {}) as Readonly<
    Record<string, Readonly<Record<string, PreviewMatrixValue>>>
  >;
  validateInclude(axes, include);

  let combinations: ReadonlyArray<RuntimeCombination> = [
    { input: {}, nameParts: [] },
  ];
  for (const [axis, values] of axes) {
    combinations = combinations.flatMap((combination) =>
      values.map((value) => ({
        input: { ...combination.input, [axis]: value },
        nameParts: [...combination.nameParts, `${axis}=${valueName(value)}`],
      })),
    );
  }

  const definitions: Record<string, PreviewDefinition> = {};
  for (const combination of combinations) {
    if (isExcluded(combination, exclude)) continue;
    const name = combination.nameParts.join(",");
    definitions[name] = base(combination.input as PreviewMatrixAxisInput<Axes>);
  }

  for (const [name, input] of Object.entries(include)) {
    if (Object.hasOwn(definitions, name)) {
      fail(`variant name ${JSON.stringify(name)} is used more than once.`);
    }
    definitions[name] = base(input as PreviewMatrixInput<Axes, Include>);
  }

  if (Object.keys(definitions).length === 0) {
    return fail("the final matrix must contain at least one variant.");
  }

  return Object.freeze(PreviewCollection.make(definitions));
};
