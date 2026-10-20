"""Generate a project-local Lua fixture for a real Resolve API smoke test.

Not an editorial workflow: no ASR correction, semantic edit or packaging claims.
The public plan remains edit_plan.json. This fixture tests the installed API.
"""
import argparse
import hashlib
import json
from pathlib import Path

from resolve_adapter import ROOT, repo_path, digest_file


def prepare(name, output, project, root=ROOT):
    if not name or Path(name).name != name or any(c in name for c in '/\\:') or name in ('.', '..'):
        raise ValueError('Expected one source filename')
    if not project or any(c in project for c in '\\/:*?"<>|'):
        raise ValueError('Invalid project name')
    source = json.loads((root / 'asr-inbox' / name / 'source.json').read_text(encoding='utf-8-sig'))
    media = repo_path(source['source'], root)
    if digest_file(media) != source['sourceSha256']:
        raise ValueError('Source fingerprint mismatch')
    fps = source['fps']
    if fps != {'num': 30000, 'den': 1001} or source['frames'] != 2253:
        raise ValueError('This fixture is scoped to the verified DJI0146 source')
    directory = repo_path(output, root)
    if not (directory / 'project.json').is_file():
        raise ValueError('Create/reuse the review project first')
    names = ['edit_plan.json', 'resolve-smoke.lua', 'technical-test.json', 'resolve-project.drp', 'resolve-result.json']
    if any((directory / n).exists() for n in names):
        raise ValueError('Existing test files: refusing overwrite')
    plan = {'source': source['source'], 'cuts': [{
        'start': 300 * 1001 / 30000, 'end': 360 * 1001 / 30000,
        'reason': '固定60帧技术测试，非听审后的剪辑建议；不得用于正式成片'
    }], 'broll': []}
    plan_bytes = (json.dumps(plan, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    q = lambda value: json.dumps(str(value), ensure_ascii=False)
    script = LUA.replace('@MEDIA@', q(media.as_posix())).replace('@PROJECT@', q(project))
    script = script.replace('@OUTPUT@', q(directory.as_posix()))
    script = script.replace('@HASH@', q(hashlib.sha256(plan_bytes).hexdigest()))
    script = script.replace('@MEDIA_DIR@', q((root / 'tools/davinci-resolve-data').as_posix()))
    for filename, value in [
        ('edit_plan.json', plan_bytes),
        ('resolve-smoke.lua', script.encode('utf-8')),
        ('technical-test.json', (json.dumps({
            'purpose': 'Resolve editable timeline API smoke test only',
            'source': source['source'], 'sourceSha256': source['sourceSha256'],
            'planSha256': hashlib.sha256(plan_bytes).hexdigest(),
            'sourceFrames': 2253, 'expectedEditedFrames': 2193,
            'removedFrames': [300, 360], 'editorialApproved': False,
            'audioVisualReviewed': False, 'subtitleTrackImported': False,
            'readyForPackaging': False,
        }, ensure_ascii=False, indent=2) + '\n').encode('utf-8')),
    ]:
        with (directory / filename).open('xb') as f:
            f.write(value)
    return {'script': (directory / 'resolve-smoke.lua').relative_to(root).as_posix(),
            'project': project, 'technicalTestOnly': True}


LUA = r'''-- Generated technical fixture, not an approved editorial cut.
local projectName, output = @PROJECT@, @OUTPUT@
local function check(value, label)
  assert(value, 'Resolve failed: ' .. label)
  return value
end
local function run()
  local pm = check(resolve:GetProjectManager(), 'project manager')
  for _, name in ipairs(pm:GetProjectListInCurrentFolder() or {}) do
    assert(name ~= projectName, 'Existing project; no overwrite')
  end
  if pm:GetCurrentProject() then check(pm:SaveProject(), 'save previous project') end
  local p = check(pm:CreateProject(projectName, @MEDIA_DIR@), 'create separate test project')
  check(p:SetSetting('timelineFrameRate', '29.97'), 'fps')
  check(p:SetSetting('timelineResolutionWidth', '3840'), 'width')
  check(p:SetSetting('timelineResolutionHeight', '2160'), 'height')
  local pool = check(p:GetMediaPool(), 'media pool')
  local media = check(pool:ImportMedia({@MEDIA@}), 'import original source')
  assert(#media == 1, 'Unexpected media count')
  local item = media[1]
  assert(tonumber(item:GetClipProperty('Frames')) == 2253, 'Source frame count differs')
  local origin = check(tonumber(item:GetClipProperty('Start')), 'source start')
  local observations = {}
  local function make(name, spans)
    local t = check(pool:CreateEmptyTimeline(name), 'create timeline')
    check(p:SetCurrentTimeline(t), 'select timeline')
    check(t:SetStartTimecode('00:00:00:00'), 'zero timeline start')
    assert(t:GetStartFrame() == 0, 'Timeline start differs')
    assert(tostring(t:GetSetting('timelineFrameRate')) == '29.97', 'Timeline fps differs')
    local at = 0
    for _, span in ipairs(spans) do
      local linked = {}
      for index, kind in ipairs({'video', 'audio'}) do
        if t:GetTrackCount(kind) < 1 then check(t:AddTrack(kind), 'add track') end
        local added = check(pool:AppendToTimeline({{
          mediaPoolItem=item, startFrame=origin+span[1], endFrame=origin+span[2],
          recordFrame=at, trackIndex=1, mediaType=index
        }}), 'append '..kind)
        assert(#added == 1, 'Unexpected append count')
        local c = added[1]
        assert(c:GetStart() == at, 'Record start differs')
        assert(c:GetDuration() == span[2]-span[1], 'End-frame contract differs')
        assert(c:GetLeftOffset() == span[1], 'Source offset differs')
        linked[#linked+1] = c
      end
      check(t:SetClipsLinked(linked, true), 'link picture and sound')
      for _, c in ipairs(linked) do
        assert(#(c:GetLinkedItems() or {}) == 1, 'Linked AV read-back differs')
      end
      at = at + span[2]-span[1]
    end
    assert(t:GetEndFrame()-t:GetStartFrame() == at, 'Timeline duration differs')
    for _, kind in ipairs({'video', 'audio'}) do
      local clips = t:GetItemListInTrack(kind, 1) or {}
      assert(#clips == #spans, 'Whole-track clip count differs')
    end
    observations[#observations+1] = name..':'..at..' frames/'..#spans..' linked AV segments'
    return t
  end
  make('01-original', {{0,2253}})
  make('02-api-test-NOT-FINAL', {{0,300},{360,2253}})
  check(pm:SaveProject(), 'save test project')
  check(pm:ExportProject(projectName, output..'/resolve-project.drp'), 'export DRP')
  resolve:OpenPage('edit')
  print('VIDEO_PIPELINE_SMOKE_OK '..projectName)
  print('PLAN_SHA256 '..@HASH@)
  for _, value in ipairs(observations) do print(value) end
  print('TECHNICAL TEST ONLY: audio/subtitles/editorial review and packaging NOT approved')
end
local ok, err = pcall(run)
if not ok then print('VIDEO_PIPELINE_SMOKE_FAILED '..tostring(err)) end
'''


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--name', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--project', required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(args.name, args.output, args.project), ensure_ascii=False))
