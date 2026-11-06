import { z } from 'zod';

const chartLabel = z.string().trim().min(1).max(20);
const axisLabel = z.string().trim().min(1).max(50).optional();
const chartTitle = z.string().trim().min(1).max(50);

const pieChartSchema = z.strictObject({
  type: z.literal('pie'),
  title: chartTitle,
  segments: z
    .array(z.strictObject({ label: chartLabel, value: z.number().positive() }))
    .min(1)
    .max(12),
});

const seriesChartSchema = z
  .strictObject({
    type: z.enum(['bar', 'line', 'area']),
    title: chartTitle,
    categories: z.array(chartLabel).min(1).max(20),
    series: z
      .array(z.strictObject({ name: chartLabel, values: z.array(z.number()) }))
      .min(1)
      .max(12),
    xLabel: axisLabel,
    yLabel: axisLabel,
  })
  .refine(
    ({ categories, series }) =>
      series.every(({ values }) => values.length === categories.length),
    { error: 'Every series needs exactly one value per category.' }
  );

export const chartSchema = z.discriminatedUnion('type', [
  pieChartSchema,
  seriesChartSchema,
]);

const tableCell = z.union([z.string().max(500), z.number()]);

export const tableSchema = z
  .strictObject({
    caption: z.string().trim().min(1).max(150),
    columns: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
    rows: z.array(z.array(tableCell)).min(1).max(200),
  })
  .refine(
    ({ columns, rows }) => rows.every((row) => row.length === columns.length),
    { error: 'Every row needs exactly one cell per column.' }
  );

export type Chart = z.infer<typeof chartSchema>;
export type Table = z.infer<typeof tableSchema>;
