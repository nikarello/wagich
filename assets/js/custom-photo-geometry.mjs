export const PHOTO_SIZE = 1254;
export const PHOTO_CONFIG = {
  bed: { width:1040, height:1280, light:[201/255,192/255,183/255] },
  wall: { width:1280, height:960, light:[231/255,231/255,233/255] },
  armchair: { width:PHOTO_SIZE, height:PHOTO_SIZE, light:[.69,.69,.69] },
  bedspread: { width:PHOTO_SIZE, height:PHOTO_SIZE, light:[.69,.69,.69] },
  floor: { width:PHOTO_SIZE, height:PHOTO_SIZE, light:[.69,.69,.69] },
};
export const PHOTO_SCENES = Object.keys(PHOTO_CONFIG);

// Traced at the source photograph's native size. v follows one continuous
// length of cloth, including the back, seat and hanging front on the chair.
const surfaces = {
  armchair: [
    { v: 0, left: [428,185], right: [1028,192], bend: [0,-7,-4,3,7,2,-1,-6,0] },
    { v: .18, left: [405,342], right: [1015,352], bend: [0,5,-3,12,-5,-17,8,4,0] },
    { v: .37, left: [379,527], right: [981,551], bend: [0,2,-6,6,16,-13,4,-5,0] },
    { v: .44, left: [352,588], right: [974,611], bend: [0,-6,-10,-6,12,-28,-2,-8,0] },
    { v: .56, left: [290,667], right: [1026,689], bend: [0,-22,-33,-28,-5,-20,-15,-7,0] },
    { v: .72, left: [281,809], right: [1008,861], bend: [0,-5,-8,0,-2,-8,-5,0,0] },
    { v: 1, left: [273,991], right: [980,1118], bend: [0,-23,-40,-46,-40,-35,-23,-6,0] },
  ],
  bedspread: [
    { v: 0, left: [469,270], right: [1117,378], bend: [0,0,-4,-2,-1,-3,0,-2,0] },
    { v: .2, left: [336,429], right: [1066,561], bend: [0,-4,1,-4,2,0,0,-2,0] },
    { v: .43, left: [166,633], right: [1021,772], bend: [0,-6,1,-8,-3,2,-1,-3,0] },
    { v: .61, left: [111,759], right: [991,918], bend: [0,-8,-5,-14,-6,4,-4,-7,0] },
    { v: .7, left: [110,813], right: [980,1000], bend: [0,-11,-17,-4,-11,-1,-6,-5,0] },
    { v: 1, left: [113,956], right: [947,1190], bend: [0,-12,-8,-22,-25,-11,-10,-23,-28,-29,-12,-9,-11,-10,-8,-4,0] },
  ],
};

const mix = (a,b,t) => a + (b-a)*t;
function spline(a,b,c,d,t) {
  return .5 * ((2*b) + (-a+c)*t + (2*a-5*b+4*c-d)*t*t + (-a+3*b-3*c+d)*t*t*t);
}
function crossSection(row,u) {
  const k = u * (row.bend.length-1), i = Math.min(row.bend.length-2, Math.floor(k));
  const at = (n) => row.bend[Math.max(0,Math.min(row.bend.length-1,n))];
  return [mix(row.left[0],row.right[0],u), mix(row.left[1],row.right[1],u) + spline(at(i-1),at(i),at(i+1),at(i+2),k-i)];
}

function traceSurface(scene,u,v) {
  const rows = surfaces[scene];
  if (!rows) throw new Error(`Unknown photo scene: ${scene}`);
  const end = Math.max(1, rows.findIndex(row => row.v >= v));
  const start = end-1, t = (v-rows[start].v)/(rows[end].v-rows[start].v);
  const pts = [start-1,start,end,end+1].map(i => crossSection(rows[Math.max(0,Math.min(rows.length-1,i))],u));
  return [0,1].map(axis => spline(pts[0][axis],pts[1][axis],pts[2][axis],pts[3][axis],t));
}

// The traced bed rows describe the photographed silhouette, not equal lengths
// of fabric. Recover the unrolled distance before assigning texture coordinates.
// The top plane is foreshortened; the front faces the camera more directly.
// Perspective scale comes from each row's width, so distant rows do not consume
// the same amount of artwork as equally tall rows nearer the camera.
const BED_DEPTH_SAMPLES = 1024;
function bedDepthTable() {
  const lengths = new Float64Array(BED_DEPTH_SAMPLES+1);
  const elevation = 35*Math.PI/180;
  let previous = traceSurface("bedspread",.5,0);
  for (let i=1;i<=BED_DEPTH_SAMPLES;i++) {
    const t=i/BED_DEPTH_SAMPLES, midpoint=(i-.5)/BED_DEPTH_SAMPLES;
    const point=traceSurface("bedspread",.5,t);
    const left=traceSurface("bedspread",0,midpoint), right=traceSurface("bedspread",1,midpoint);
    const dx=right[0]-left[0],dy=right[1]-left[1],width=Math.hypot(dx,dy);
    // Measure across the rows, excluding sideways shear along the fabric.
    const distance=((point[1]-previous[1])*dx-(point[0]-previous[0])*dy)/width;
    const turn=Math.max(0,Math.min(1,(midpoint-.5)/.2));
    const bend=turn*turn*(3-2*turn);
    const projection=Math.cos((1-bend)*(Math.PI/2-elevation)-bend*elevation);
    lengths[i]=lengths[i-1]+distance/width/projection;
    previous=point;
  }
  const total=lengths[BED_DEPTH_SAMPLES];
  return lengths.map(length=>length/total);
}
const bedDepths=bedDepthTable();

function bedTracePosition(v) {
  if (v<=0) return 0;
  if (v>=1) return 1;
  let low=0,high=BED_DEPTH_SAMPLES;
  while (high-low>1) {
    const mid=(low+high)>>1;
    if (bedDepths[mid]<v) low=mid;
    else high=mid;
  }
  const fraction=(v-bedDepths[low])/(bedDepths[high]-bedDepths[low]);
  return (low+fraction)/BED_DEPTH_SAMPLES;
}

export function projectPhoto(scene,u,v) {
  // Follow the supplied wall templates without adding artificial folds. Each
  // column has a uniform vertical scale between the photographed inner seams.
  if (scene === "bed") {
    const left=mix(309,316,v)+2*Math.sin(Math.PI*v);
    const top=102+10*Math.sin(Math.PI*u);
    const bottom=599-Math.sin(Math.PI*u);
    return [mix(left,714,u),mix(top,bottom,v)];
  }
  if (scene === "wall") {
    const left=mix(435,439,v)+4*Math.sin(Math.PI*v);
    const top=mix(52,50,u)+9*Math.sin(Math.PI*u);
    return [mix(left,826,u),mix(top,mix(524,522,u),v)];
  }
  if (scene === "floor") {
    const depth = 1 / (1 - .32*v);
    return [(311+640*u-207*v)*depth, (460+298*v+2*u)*depth];
  }
  return traceSurface(scene,u,scene === "bedspread" ? bedTracePosition(v) : v);
}

export function photoMesh(scene,columns=24,rows=48) {
  const vertices = [];
  for (let y=0;y<rows;y++) for (let x=0;x<columns;x++) {
    const uv = [[x/columns,y/rows],[(x+1)/columns,y/rows],[(x+1)/columns,(y+1)/rows],[x/columns,(y+1)/rows]];
    for (const i of [0,1,2,0,2,3]) vertices.push(...projectPhoto(scene,...uv[i]),...uv[i]);
  }
  return new Float32Array(vertices);
}
