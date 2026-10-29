import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectLocationCountries} from '../scripts/entity-catalog-projection.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const entries=read('mod-kit/entity-catalog/locations.json').entries;
const country=id=>entries.find(e=>e.id===id)?.definition.country;
test('同名异地独立国别，原阶段引用保留',()=>{
 for(const [id,c] of Object.entries({'lcq.location.shuixiang_lou':'宋','lyg.location.shuixiang_lou':'唐','lyl.location.shangshenguan':'汉','lyg.location.shangshenguan':'唐','liuchao.location.linzhi':'昭南'}))assert.equal(country(id),c);
 assert.ok(entries.find(e=>e.id==='lyg.location.shuixiang_lou').stageVariants['lyg.shixiang_ambush']);
 assert.ok(entries.find(e=>e.id==='lyl.location.shangshenguan').stageVariants['lyl.luoyang_cloud_secret']);
});
test('明确裁定和五原子地点同步各阶段，南荒商路仍南荒',()=>{
 for(const e of entries.filter(e=>e.id.startsWith('lcq.zone.wuyuan.')||['liuchao.location.wuyuan','liuchao.location.baihu_shang_guan'].includes(e.id)))for(const d of [e.definition,...Object.values(e.stageVariants)])assert.equal(d.country,'中立边陲');
 for(const id of ['diqiu','kunwu','nanzhao'])assert.equal(country('liuchao.location.'+id),'昭南');
 assert.equal(country('lcq.location.nanhuang_route'),'南荒');
 for(const id of ['roman_camp','macedon_camp'])assert.equal(country('lcq.location.'+id),'域外');
});
test('未定地点精确保留空白',()=>{
 assert.deepEqual(entries.filter(e=>!e.definition.country).map(e=>e.id).sort(),['liuchao.location.guang_ming_guan','lcq.location.beast_camp','liuchao.location.qishan','liuchao.location.boling','liuchao.location.zhuoguang','liuchao.location.bailuojiang','liuchao.location.mijing_wilderness','lcq.location.grassland','lyl.location.ant_hill','lyg.location.yanglu_menyuan'].sort());
});
test('国别投影涵盖所有已发布地点并幂等；未定不推断',()=>{
 const {ids}=read('src/modules/scenarioMods/builtins/manifest.json');
 for(const id of ids){const mod=read(`src/modules/scenarioMods/builtins/data/${id}.json`);const projected=structuredClone(mod);for(const l of projected.canon.locations)delete l.country;projectLocationCountries(projected);assert.deepEqual(projected,mod,id);projectLocationCountries(projected);assert.deepEqual(projected,mod,id);}
});
