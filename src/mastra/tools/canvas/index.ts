import { createCanvasTool } from './create';
import { editCanvasTool } from './edit';
import { listCanvasesTool } from './list';
import { readCanvasTool } from './read';
import { lookupCanvasSectionsTool } from './sections';
import { updateCanvasTableTool } from './table';

export const canvasTools = {
  create_canvas: createCanvasTool,
  list_canvases: listCanvasesTool,
  read_canvas: readCanvasTool,
  edit_canvas: editCanvasTool,
  lookup_canvas_sections: lookupCanvasSectionsTool,
  update_canvas_table: updateCanvasTableTool,
};
