import test from "node:test";
import assert from "node:assert/strict";
import { PHOTO_SCENES, PHOTO_CONFIG, photoMesh, projectPhoto } from "../../assets/js/custom-photo-geometry.mjs";

test("photo surfaces do not invert, fold across themselves or leave their photograph", () => {
  for (const scene of PHOTO_SCENES) {
    const {width,height}=PHOTO_CONFIG[scene];
    const mesh = photoMesh(scene);
    for (let i=0;i<mesh.length;i+=12) {
      const [ax,ay,, ,bx,by,, ,cx,cy] = mesh.subarray(i,i+12);
      assert.ok((bx-ax)*(cy-ay)-(by-ay)*(cx-ax)>0, `${scene}: inverted triangle`);
      for (let j=i;j<i+12;j+=4) {
        assert.ok(mesh[j]>=0 && mesh[j]<width && mesh[j+1]>=0 && mesh[j+1]<height);
        assert.ok(mesh[j+2]>=0 && mesh[j+2]<=1 && mesh[j+3]>=0 && mesh[j+3]<=1);
      }
    }
  }
});

test("wall templates preserve the print proportions and keep equal vertical spacing", () => {
  for (const key of ["bed","wall"]) {
    const top=projectPhoto(key,.5,0), bottom=projectPhoto(key,.5,1);
    const left=projectPhoto(key,0,.5),right=projectPhoto(key,1,.5);
    const ratio=(right[0]-left[0])/(bottom[1]-top[1]);
    assert.ok(Math.abs(ratio/(13/16)-1)<.035,"Only the template's slight perspective may affect print proportions");
    for (const v of [.25,.5,.75]) {
      assert.ok(Math.abs(projectPhoto(key,.5,v)[1]-(top[1]+(bottom[1]-top[1])*v))<.01);
    }
  }
});

test("floor artwork stays below the photographed sofa and its feet", () => {
  for (let v=0;v<=1;v+=.01) for (let u=0;u<=1;u+=.01) {
    assert.ok(projectPhoto("floor",u,v)[1]>=460);
  }
});

// Compare the projected height and width of a small square in the physical
// 130 × 160 cm image. Measuring perpendicular to each row excludes camera shear.
function bedPrintScale(v) {
  const delta=.0001;
  const a=projectPhoto("bedspread",.5-delta,v),b=projectPhoto("bedspread",.5+delta,v);
  const c=projectPhoto("bedspread",.5,v-delta),d=projectPhoto("bedspread",.5,v+delta);
  const dx=b[0]-a[0],dy=b[1]-a[1];
  return ((d[1]-c[1])*dx-(d[0]-c[0])*dy)/(dx*dx+dy*dy)*13/16;
}

test("bed artwork has consistent perspective on the top and keeps its height on the hanging front", () => {
  const top=[.1,.2,.3,.4,.5,.6,.68].map(bedPrintScale);
  for (const scale of top) assert.ok(scale>.55 && scale<.8,"Squares on the top should be foreshortened");
  assert.ok(Math.max(...top)-Math.min(...top)<.04,"The same flat plane must not stretch different parts of the print");
  for (const v of [.9,.93,.96,.98]) {
    const front=bedPrintScale(v);
    assert.ok(front>.88 && front<1.08,"The front must preserve the height of printed squares");
  }
});

test("bed proportion correction retains all four corners against the original fringe", () => {
  assert.deepEqual(projectPhoto("bedspread",0,0),[469,270]);
  assert.deepEqual(projectPhoto("bedspread",1,0),[1117,378]);
  assert.deepEqual(projectPhoto("bedspread",0,1),[113,956]);
  assert.deepEqual(projectPhoto("bedspread",1,1),[947,1190]);
});
