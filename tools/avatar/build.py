import importlib
import json
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector


def mpfb(package, key):
    for name in list(sys.modules):
        if name.endswith(package):
            return getattr(importlib.import_module(name), key)
    raise ValueError(f"MPFB not loaded: {package}")


HumanService = mpfb("mpfb.services.humanservice", "HumanService")
AssetService = mpfb("mpfb.services.assetservice", "AssetService")

FEMALE_LOOK = {
    "macro": {"gender": 0.0, "age": 0.42, "muscle": 0.62, "weight": 0.52, "proportions": 1.0, "height": 0.62,
              "cupsize": 0.5, "firmness": 0.65},
    "skin": "young_caucasian_female",
    "assets": [("eyes", "low-poly", "Eyes"), ("eyebrows", "eyebrow010", "Eyebrows"),
               ("eyelashes", "eyelashes02", "Eyelashes"), ("hair", "ponytail01", "Hair")],
}
MALE_LOOK = {
    "macro": {"gender": 1.0, "age": 0.48, "muscle": 1.0, "weight": 0.62, "proportions": 1.0, "height": 0.72,
              "cupsize": 0.5, "firmness": 0.5},
    "skin": "young_caucasian_male",
    "assets": [("eyes", "low-poly", "Eyes"), ("eyebrows", "eyebrow001", "Eyebrows"),
               ("eyelashes", "eyelashes01", "Eyelashes"), ("hair", "short02", "Hair")],
}
LOOKS = {"female": FEMALE_LOOK, "male": MALE_LOOK}


def arguments():
    raw = sys.argv[sys.argv.index("--") + 1:]
    return dict(zip(raw[::2], raw[1::2]))


def human(body):
    look = LOOKS[body]
    macro = dict(look["macro"], race={"african": 0.0, "asian": 0.0, "caucasian": 1.0})
    mesh = HumanService.create_human(macro_detail_dict=macro)
    skin = AssetService.find_asset_absolute_path(look["skin"] + ".mhmat", asset_subdir="skins")
    HumanService.set_character_skin(skin, mesh, skin_type="GAMEENGINE")
    rig = HumanService.add_builtin_rig(mesh, "game_engine")
    parts = {"body": mesh}
    for folder, name, kind in look["assets"]:
        path = AssetService.find_asset_absolute_path(name + ".mhclo", asset_subdir=folder)
        parts[folder] = HumanService.add_mhclo_asset(path, mesh, asset_type=kind, material_type="GAMEENGINE",
                                                    subdiv_levels=0)
    for obj in parts.values():
        settle(obj)
    return rig, parts


def activate(obj):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def settle(obj):
    activate(obj)
    if obj.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for modifier in list(obj.modifiers):
        if modifier.type == "SUBSURF":
            obj.modifiers.remove(modifier)
        elif modifier.type == "MASK":
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    for group in list(obj.vertex_groups):
        if group.name.startswith(("helper-", "joint-")) or group.name in ("Mid", "Left", "Right", "body",
                                                                        "HelperGeometry", "JointCubes"):
            obj.vertex_groups.remove(group)


def aim(rig, name, direction, twist=0.0):
    bpy.context.view_layer.update()
    pose = rig.pose.bones[name]
    rest = pose.bone.matrix_local.to_3x3()
    frame = rest
    if pose.parent:
        frame = pose.parent.matrix.to_3x3() @ pose.parent.bone.matrix_local.to_3x3().inverted() @ rest
    local = (frame.inverted() @ Vector(direction)).normalized()
    pose.rotation_mode = "QUATERNION"
    pose.rotation_quaternion = Vector((0, 1, 0)).rotation_difference(local) @ Quaternion((0, 1, 0), math.radians(twist))
    bpy.context.view_layer.update()


def bend(rig, name, x=0.0, y=0.0, z=0.0):
    pose = rig.pose.bones[name]
    pose.rotation_mode = "QUATERNION"
    pose.rotation_quaternion = pose.rotation_quaternion @ Quaternion((1, 0, 0), math.radians(x)) \
        @ Quaternion((0, 1, 0), math.radians(y)) @ Quaternion((0, 0, 1), math.radians(z))
    bpy.context.view_layer.update()


FINGERS = ("index", "middle", "ring", "pinky")


def stance(rig, phase):
    breath = math.sin(phase)
    sway = math.sin(phase * 0.5)
    for pose in rig.pose.bones:
        pose.rotation_mode = "QUATERNION"
        pose.rotation_quaternion = Quaternion()
    bend(rig, "spine_02", x=-1.2 * breath)
    bend(rig, "spine_03", x=-1.0 * breath)
    bend(rig, "neck_01", x=0.8 * breath)
    bend(rig, "head", z=2.5 * sway, x=-1.0)
    bend(rig, "pelvis", y=0.8 * sway)
    for side, sign in (("l", 1), ("r", -1)):
        aim(rig, f"upperarm_{side}", (sign * 0.3, 0.02 + 0.015 * breath, -1), twist=sign * -10)
        aim(rig, f"lowerarm_{side}", (sign * 0.16, -0.3 - 0.02 * sway, -1))
        for finger in FINGERS:
            for joint, angle in (("01", 38), ("02", 52), ("03", 34)):
                bend(rig, f"{finger}_{joint}_{side}", x=angle)
        bend(rig, f"thumb_02_{side}", x=18)
        bend(rig, f"thumb_03_{side}", x=22)


def idle(rig, frames=96):
    rig.animation_data_create()
    action = bpy.data.actions.new("idle")
    rig.animation_data.action = action
    for frame in range(0, frames + 1, 6):
        stance(rig, 2 * math.pi * frame / frames)
        for pose in rig.pose.bones:
            pose.keyframe_insert("rotation_quaternion", frame=frame + 1)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, frames + 1
    stance(rig, 0.0)


def bone_weights(obj):
    bones = {bone.name for bone in obj.parent.data.bones} if obj.parent and obj.parent.type == "ARMATURE" else None
    names = {group.index: group.name for group in obj.vertex_groups if bones is None or group.name in bones}
    return [{names[g.group]: g.weight for g in vertex.groups if g.weight > 0 and g.group in names} for vertex in obj.data.vertices]


def bone_head(rig, name):
    return rig.data.bones[name].head_local.copy()


def bone_tail(rig, name):
    return rig.data.bones[name].tail_local.copy()


def along(rig, name, t):
    return bone_head(rig, name).lerp(bone_tail(rig, name), t)


def axis(rig, name):
    return (bone_tail(rig, name) - bone_head(rig, name)).normalized()


def duplicate(obj, name):
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = name
    copy.data.name = name
    bpy.context.scene.collection.objects.link(copy)
    for modifier in list(copy.modifiers):
        if modifier.type != "ARMATURE":
            copy.modifiers.remove(modifier)
    return copy


def shell(body, name, bones, offset, cuts=(), keep=None, threshold=0.35, uv_scale=None, detail=0.5):
    obj = duplicate(body, name)
    weights = bone_weights(obj)
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    mesh.verts.ensure_lookup_table()
    names = sorted({bone for w in weights for bone in w})
    layer = mesh.verts.layers.int.new("dominant")
    for vertex in mesh.verts:
        w = weights[vertex.index]
        vertex[layer] = names.index(max(w, key=w.get)) if w else -1
    doomed = [v for v in mesh.verts
              if sum(w for b, w in weights[v.index].items() if b in bones) < threshold
              or (keep is not None and not keep(v.co))]
    bmesh.ops.delete(mesh, geom=doomed, context="VERTS")
    for cut in cuts:
        point, normal, only = cut if len(cut) == 3 else (*cut, None)
        allowed = {names.index(n) for n in only if n in names} if only else None
        faces = [f for f in mesh.faces if allowed is None or all(v[layer] in allowed for v in f.verts)]
        edges = list({e for f in faces for e in f.edges})
        verts = list({v for f in faces for v in f.verts})
        bmesh.ops.bisect_plane(mesh, geom=verts + edges + faces, plane_co=point, plane_no=normal, clear_outer=True)
    loose = [v for v in mesh.verts if not v.link_faces]
    bmesh.ops.delete(mesh, geom=loose, context="VERTS")
    mesh.normal_update()
    for vertex in mesh.verts:
        vertex.co += vertex.normal * offset
    if uv_scale:
        layer = mesh.loops.layers.uv.active
        for face in mesh.faces:
            for loop in face.loops:
                loop[layer].uv *= uv_scale
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.attributes.remove(obj.data.attributes["dominant"])
    obj.data.materials.clear()
    if detail < 1:
        modifier = obj.modifiers.new("decimate", "DECIMATE")
        modifier.ratio = detail
        obj.modifiers.move(len(obj.modifiers) - 1, 0)
        apply_modifiers(obj)
    return obj


def relax(obj, iterations, factor=0.6):
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    inner = [v for v in mesh.verts if not v.is_boundary]
    for _ in range(iterations):
        bmesh.ops.smooth_vert(mesh, verts=inner, factor=factor, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    mesh.to_mesh(obj.data)
    mesh.free()


def solidify(obj, thickness, rim=True):
    modifier = obj.modifiers.new("solid", "SOLIDIFY")
    modifier.thickness = thickness
    modifier.offset = 1.0
    modifier.use_rim = rim
    modifier.use_even_offset = False
    modifier.use_quality_normals = True
    obj.modifiers.move(len(obj.modifiers) - 1, 0)
    apply_modifiers(obj, keep_armature=True)


def apply_modifiers(obj, keep_armature=True):
    activate(obj)
    for modifier in list(obj.modifiers):
        if keep_armature and modifier.type == "ARMATURE":
            continue
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def smooth(obj, angle=50):
    activate(obj)
    obj.data.shade_smooth()
    obj.data.set_sharp_from_angle(angle=math.radians(angle))


def material(name, colour, roughness=0.7, metallic=0.0, normal=None, rough_map=None, alpha=None):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*srgb(colour), 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if normal:
        image = nodes.new("ShaderNodeTexImage")
        image.image = normal
        image.image.colorspace_settings.name = "Non-Color"
        node = nodes.new("ShaderNodeNormalMap")
        links.new(image.outputs["Color"], node.inputs["Color"])
        links.new(node.outputs["Normal"], bsdf.inputs["Normal"])
    if rough_map:
        image = nodes.new("ShaderNodeTexImage")
        image.image = rough_map
        image.image.colorspace_settings.name = "Non-Color"
        links.new(image.outputs["Color"], bsdf.inputs["Roughness"])
    if alpha:
        image = nodes.new("ShaderNodeTexImage")
        image.image = alpha
        image.image.colorspace_settings.name = "Non-Color"
        links.new(image.outputs["Color"], bsdf.inputs["Alpha"])
        mat.blend_method = "CLIP"
    return mat


def srgb(colour):
    def channel(value):
        value /= 255
        return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4
    colour = colour.lstrip("#")
    return tuple(channel(int(colour[i:i + 2], 16)) for i in (0, 2, 4))


def paint(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def bind(obj, rig, bone):
    obj.vertex_groups.clear()
    group = obj.vertex_groups.new(name=bone)
    group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
    modifier = obj.modifiers.new("rig", "ARMATURE")
    modifier.object = rig
    obj.parent = rig


def blend(obj, rig, bones):
    obj.vertex_groups.clear()
    groups = {name: obj.vertex_groups.new(name=name) for name in bones}
    heads = {name: (bone_head(rig, name), bone_tail(rig, name)) for name in bones}
    for vertex in obj.data.vertices:
        distances = {}
        for name, (head, tail) in heads.items():
            segment = tail - head
            t = max(0.0, min(1.0, (vertex.co - head).dot(segment) / segment.length_squared))
            distances[name] = (vertex.co - (head + segment * t)).length
        weights = {name: 1.0 / max(d, 1e-4) ** 4 for name, d in distances.items()}
        total = sum(weights.values())
        for name, weight in weights.items():
            if weight / total > 0.02:
                groups[name].add([vertex.index], weight / total, "REPLACE")
    modifier = obj.modifiers.new("rig", "ARMATURE")
    modifier.object = rig
    obj.parent = rig


def join(objects, name):
    activate(objects[0])
    for obj in objects[1:]:
        obj.select_set(True)
    bpy.ops.object.join()
    result = bpy.context.view_layer.objects.active
    result.name = name
    result.data.name = name
    return result


def primitive(kind, **options):
    getattr(bpy.ops.mesh, f"primitive_{kind}_add")(**options)
    return bpy.context.view_layer.objects.active


def place(obj, matrix):
    obj.matrix_world = matrix @ obj.matrix_world
    activate(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def texture(name, size, height, strength=2.0):
    import numpy as np
    field = height(np.mgrid[0:size, 0:size].astype(np.float32) / size)
    dx = (np.roll(field, -1, axis=1) - np.roll(field, 1, axis=1)) * strength * size / 64
    dy = (np.roll(field, -1, axis=0) - np.roll(field, 1, axis=0)) * strength * size / 64
    normal = np.dstack([-dx, -dy, np.ones_like(field)])
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    pixels = np.dstack([normal * 0.5 + 0.5, np.ones_like(field)]).astype(np.float32)
    image = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    return image


def noise(shape, scale, seed):
    import numpy as np
    rng = np.random.default_rng(seed)
    coarse = rng.random((scale, scale)).astype(np.float32)
    reps = shape // scale
    big = np.kron(coarse, np.ones((reps, reps), dtype=np.float32))
    for _ in range(2):
        big = (big + np.roll(big, 1, 0) + np.roll(big, -1, 0) + np.roll(big, 1, 1) + np.roll(big, -1, 1)) / 5
    return big


def textures():
    import numpy as np
    size = 256

    def weave(grid):
        y, x = grid
        warp = np.sin(x * 2 * np.pi * 32) * np.sign(np.sin(y * 2 * np.pi * 16))
        weft = np.sin(y * 2 * np.pi * 32) * np.sign(np.sin(x * 2 * np.pi * 16 + np.pi / 2))
        return 0.5 * (np.abs(warp) + np.abs(weft)) + 0.3 * noise(size, 32, 1)

    def grain(_grid):
        return noise(size, 64, 2) * 0.7 + noise(size, 16, 3) * 0.6

    def rings(grid):
        y, x = grid
        n = 16
        out = np.zeros_like(x)
        for shift in (0.0, 0.5):
            cx = ((x * n + shift) % 1) - 0.5
            cy = ((y * n * 0.8 + shift) % 1) - 0.5
            r = np.sqrt(cx ** 2 + cy ** 2)
            out = np.maximum(out, np.clip(1 - np.abs(r - 0.36) / 0.12, 0, 1))
        return out

    def planks(grid):
        y, x = grid
        seams = np.clip(np.abs(((x * 5) % 1) - 0.5) * 2 - 0.92, 0, 1) * -8
        lines = np.sin((y * 3 + noise(size, 8, 4) * 0.6) * 2 * np.pi * 9) * 0.25
        return seams + lines + noise(size, 64, 5) * 0.3

    def hammered(_grid):
        return noise(size, 16, 6) * 0.6 + noise(size, 64, 7) * 0.2

    return {
        "cloth": texture("cloth", size, weave, 1.2),
        "leather": texture("leather", size, grain, 1.4),
        "chain": texture("chain", size, rings, 5.0),
        "wood": texture("wood", size, planks, 1.5),
        "metal": texture("metal", size, hammered, 0.5),
    }


class Body:
    def __init__(self, rig, mesh):
        self.rig = rig
        self.mesh = mesh
        self.weights = bone_weights(mesh)
        self.points = [v.co.copy() for v in mesh.data.vertices]
        self.dominant = [max(w, key=w.get) if w else "" for w in self.weights]

    def head(self, bone):
        return bone_head(self.rig, bone)

    def tail(self, bone):
        return bone_tail(self.rig, bone)

    def at(self, bone, t):
        return along(self.rig, bone, t)

    def axis(self, bone):
        return axis(self.rig, bone)

    def extent(self, bones, direction):
        d = Vector(direction).normalized()
        return max(p.dot(d) for p, b in zip(self.points, self.dominant) if b in bones)

    def support(self, centre, normal, basis, bones, band, angles):
        u, v = basis
        slice_ = [p - centre for p, b in zip(self.points, self.dominant)
                  if b in bones and abs((p - centre).dot(normal)) < band]
        if not slice_:
            return None
        flat = [(p.dot(u), p.dot(v)) for p in slice_]
        return [max(x * math.cos(a) + y * math.sin(a) for x, y in flat) for a in angles]


def basis(normal, reference):
    n = Vector(normal).normalized()
    ref = Vector(reference)
    u = (ref - n * ref.dot(n)).normalized()
    return u, n.cross(u)


def tube(body, name, stations, bones, offset, segments=40, arc=None, band=0.015, cap=None, tile=0.06):
    start, stop = arc if arc else (0.0, 2 * math.pi)
    closed = arc is None
    count = segments if closed else segments + 1
    angles = [start + (stop - start) * i / (segments if closed else segments) for i in range(count)]
    rings = []
    last = None
    for centre, normal, reference, extra, scale in stations:
        centre, normal = Vector(centre), Vector(normal).normalized()
        u, v = basis(normal, reference)
        radii = body.support(centre, normal, (u, v), bones, band, angles) or last
        if radii is None:
            continue
        last = radii
        ring = [centre + (u * math.cos(a) + v * math.sin(a)) * (r * scale + offset + extra) for a, r in zip(angles, radii)]
        rings.append(ring)
    mesh = bmesh.new()
    verts = [[mesh.verts.new(p) for p in ring] for ring in rings]
    uv = mesh.loops.layers.uv.new("UVMap")
    lengths = [0.0]
    for a, b in zip(rings, rings[1:]):
        lengths.append(lengths[-1] + (sum(a, Vector()) / len(a) - sum(b, Vector()) / len(b)).length)
    radius = sum((p - sum(rings[0], Vector()) / len(rings[0])).length for p in rings[0]) / len(rings[0])
    for r in range(len(verts) - 1):
        for i in range(count if closed else count - 1):
            j = (i + 1) % count
            face = mesh.faces.new((verts[r][i], verts[r][j], verts[r + 1][j], verts[r + 1][i]))
            for loop, (ii, rr) in zip(face.loops, ((i, r), (i + 1, r), (i + 1, r + 1), (i, r + 1))):
                loop[uv].uv = (ii / count * 2 * math.pi * radius / tile, lengths[rr] / tile)
    if cap is not None:
        pole = mesh.verts.new(cap)
        ring = verts[-1]
        for i in range(count if closed else count - 1):
            mesh.faces.new((ring[i], ring[(i + 1) % count], pole))
    bmesh.ops.recalc_face_normals(mesh, faces=mesh.faces[:])
    data = bpy.data.meshes.new(name)
    mesh.to_mesh(data)
    mesh.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def bone_stations(body, bone, ts, reference, extras=None, scales=None):
    extras = extras or [0.0] * len(ts)
    scales = scales or [1.0] * len(ts)
    return [(body.at(bone, t), body.axis(bone), reference, e, s) for t, e, s in zip(ts, extras, scales)]


def vertical_stations(x, y, zs, extras=None, scales=None):
    extras = extras or [0.0] * len(zs)
    scales = scales or [1.0] * len(zs)
    return [(Vector((x, y, z)), Vector((0, 0, -1)), Vector((1, 0, 0)), e, s) for z, e, s in zip(zs, extras, scales)]


TORSO = {"pelvis", "spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r", "neck_01"}
ARM = lambda side: {f"upperarm_{side}", f"lowerarm_{side}"}
HAND = lambda side: {f"hand_{side}"} | {f"{f}_{j}_{side}" for f in FINGERS + ("thumb",) for j in ("01", "02", "03")}
LEG = lambda side: {f"thigh_{side}", f"calf_{side}"}
FOOT = lambda side: {f"foot_{side}", f"ball_{side}"}
SIDES = (("l", 1), ("r", -1))


class Wardrobe:
    def __init__(self, body, items, maps):
        self.body = body
        self.rig = body.rig
        self.items = {item["id"]: item for item in items}
        self.maps = maps

    def mat(self, item, role, roughness=0.7, metallic=0.0, normal=None):
        colour = self.items[item][role] if role in ("primary", "secondary") else role
        name = f"{item}.{role}" if role in ("primary", "secondary") else f"{item}.{role.lstrip('#')}"
        return material(name, colour, roughness, metallic, self.maps.get(normal) if normal else None)

    def finish(self, item, objects):
        result = join(objects, f"item_{item}") if len(objects) > 1 else objects[0]
        result.name = f"item_{item}"
        result.data.name = f"item_{item}"
        result.parent = self.rig
        smooth(result, 40)
        return result

    def skin_shell(self, *args, **kwargs):
        obj = shell(self.body.mesh, *args, **kwargs)
        obj.parent = self.rig
        return obj

    def torso_cuts(self, sleeve_bone, sleeve_t, neck_t, hem_z):
        b = self.body
        cuts = [(b.at("neck_01", neck_t), Vector((0, 0, 1))), (Vector((0, 0, hem_z)), Vector((0, 0, -1)))]
        for side, _ in SIDES:
            bone = f"{sleeve_bone}_{side}"
            cuts.append((b.at(bone, sleeve_t), b.axis(bone), ARM(side) | HAND(side)))
        return cuts

    def hip(self):
        return self.body.head("pelvis").z - 0.02

    def waist(self):
        return self.body.at("spine_01", 0.3).z

    def skirt(self, item, role, top, bottom, flare, offset, normal, roughness=0.8, metallic=0.0):
        b = self.body
        zs = [top + (bottom - top) * i / 6 for i in range(7)]
        extras = [flare * (i / 6) ** 1.6 for i in range(7)]
        centre = (b.head("thigh_l") + b.head("thigh_r")) / 2
        obj = tube(b, f"{item}.skirt", vertical_stations(centre.x, centre.y, zs, extras),
                   TORSO | LEG("l") | LEG("r"), offset, segments=56, band=0.02)
        solidify(obj, 0.004)
        paint(obj, self.mat(item, role, roughness, metallic, normal))
        blend(obj, self.rig, ["pelvis", "thigh_l", "thigh_r"])
        return obj

    def belt(self, item, z, role, width=0.045, offset=0.02):
        b = self.body
        centre = (b.head("thigh_l") + b.head("thigh_r")) / 2
        obj = tube(b, f"{item}.belt", vertical_stations(centre.x, centre.y, [z + width / 2, z - width / 2]),
                   TORSO | LEG("l") | LEG("r"), offset, segments=56, band=0.025)
        solidify(obj, 0.006)
        paint(obj, self.mat(item, role, 0.55, 0.0, "leather"))
        front = b.extent(TORSO, (0, -1, 0))
        buckle = primitive("cube", size=1)
        buckle.scale = (0.05, 0.012, width * 1.15)
        buckle.location = (0, -front - offset - 0.012, z)
        bevel(buckle, 0.004)
        paint(buckle, self.mat(item, "#c9a24a", 0.3, 1.0))
        objs = [obj, buckle]
        blend(obj, self.rig, ["pelvis", "spine_01"])
        bind(buckle, self.rig, "pelvis")
        return objs

    def linen_tunic(self, item):
        b = self.body
        hem = b.at("thigh_l", 0.45).z
        torso = self.skin_shell(f"{item}.torso", TORSO | ARM("l") | ARM("r"), 0.009,
                                cuts=self.torso_cuts("upperarm", 0.5, 0.05, self.hip() - 0.06), uv_scale=24)
        solidify(torso, 0.003)
        paint(torso, self.mat(item, "primary", 0.9, 0.0, "cloth"))
        skirt = self.skirt(item, "primary", self.hip() + 0.05, hem, 0.05, 0.014, "cloth", 0.9)
        parts = [torso, skirt, *self.belt(item, self.waist() - 0.03, "secondary")]
        for side, _ in SIDES:
            cuff = tube(b, f"{item}.cuff{side}", bone_stations(b, f"upperarm_{side}", [0.46, 0.52], Vector((0, -1, 0))),
                        ARM(side), 0.016, segments=24)
            solidify(cuff, 0.004)
            paint(cuff, self.mat(item, "secondary", 0.8, 0.0, "cloth"))
            blend(cuff, self.rig, [f"upperarm_{side}"])
            parts.append(cuff)
        return self.finish(item, parts)

    def chain_mail(self, item):
        b = self.body
        hem = b.at("thigh_l", 0.7).z
        torso = self.skin_shell(f"{item}.torso", TORSO | ARM("l") | ARM("r"), 0.012,
                                cuts=self.torso_cuts("lowerarm", 0.25, 0.45, self.hip() - 0.06), uv_scale=22)
        solidify(torso, 0.004)
        paint(torso, self.mat(item, "primary", 0.68, 0.9, "chain"))
        skirt = self.skirt(item, "primary", self.hip() + 0.05, hem, 0.06, 0.018, "chain", 0.68, 0.9)
        collar = tube(b, f"{item}.collar", bone_stations(b, "neck_01", [-0.1, 0.25, 0.5], Vector((1, 0, 0)), [0.03, 0.015, 0.012]),
                      TORSO | {"neck_01", "head"}, 0.012, segments=40)
        solidify(collar, 0.006)
        paint(collar, self.mat(item, "primary", 0.68, 0.9, "chain"))
        blend(collar, self.rig, ["neck_01", "spine_03"])
        parts = [torso, skirt, collar, *self.belt(item, self.waist() - 0.03, "secondary", 0.05, 0.03)]
        for side, _ in SIDES:
            hem_ring = tube(b, f"{item}.sleeve{side}", bone_stations(b, f"lowerarm_{side}", [0.2, 0.26], Vector((0, -1, 0))),
                            ARM(side), 0.02, segments=24)
            solidify(hem_ring, 0.004)
            paint(hem_ring, self.mat(item, "secondary", 0.6, 0.0, "leather"))
            blend(hem_ring, self.rig, [f"lowerarm_{side}"])
            parts.append(hem_ring)
        return self.finish(item, parts)

    def trousers(self, item, role, normal, roughness, offset=0.007):
        b = self.body
        bones = {"pelvis", "spine_01"} | LEG("l") | LEG("r")
        cuts = [(Vector((0, 0, self.waist())), Vector((0, 0, 1)))]
        for side, _ in SIDES:
            cuts.append((b.at(f"calf_{side}", 0.93), b.axis(f"calf_{side}")))
        legs = self.skin_shell(f"{item}.legs", bones, offset, cuts=cuts, uv_scale=24)
        solidify(legs, 0.003)
        paint(legs, self.mat(item, role, roughness, 0.0, normal))
        return legs

    def wool_trousers(self, item):
        b = self.body
        legs = self.trousers(item, "primary", "cloth", 0.95)
        band = tube(b, f"{item}.band", vertical_stations(0, b.head("pelvis").y, [self.waist() + 0.005, self.waist() - 0.03]),
                    TORSO | LEG("l") | LEG("r"), 0.014, segments=56, band=0.02)
        solidify(band, 0.004)
        paint(band, self.mat(item, "secondary", 0.8, 0.0, "cloth"))
        blend(band, self.rig, ["pelvis"])
        return self.finish(item, [legs, band])

    def iron_greaves(self, item):
        b = self.body
        parts = [self.trousers(item, "secondary", "cloth", 0.9, 0.008)]
        for side, sign in SIDES:
            thigh, calf = f"thigh_{side}", f"calf_{side}"
            front = Vector((0, -1, 0))
            cuisse = tube(b, f"{item}.cuisse{side}", bone_stations(b, thigh, [0.12, 0.35, 0.6, 0.86], front),
                          LEG(side), 0.02, segments=20, arc=(-1.9, 1.9))
            solidify(cuisse, 0.005)
            paint(cuisse, self.mat(item, "primary", 0.3, 1.0, "metal"))
            blend(cuisse, self.rig, [thigh])
            greave = tube(b, f"{item}.greave{side}", bone_stations(b, calf, [0.1, 0.3, 0.55, 0.82], front, [0.02, 0.016, 0.012, 0.014]),
                          LEG(side), 0.016, segments=28)
            solidify(greave, 0.005)
            paint(greave, self.mat(item, "primary", 0.3, 1.0, "metal"))
            blend(greave, self.rig, [calf])
            knee = primitive("uv_sphere", segments=24, ring_count=12, radius=0.06)
            knee.scale = (1.0, 0.55, 1.1)
            front = self.front_of(LEG(side), b.head(calf))
            knee.location = Vector((b.head(calf).x, front - 0.03, b.head(calf).z))
            paint(knee, self.mat(item, "primary", 0.25, 1.0, "metal"))
            bind(knee, self.rig, calf)
            parts += [cuisse, greave, knee, *self.rivets(item, [Vector((b.head(calf).x + sign * 0.04, front - 0.02, b.head(calf).z))])]
        return self.finish(item, parts)

    def front_of(self, bones, point, band=0.03):
        ys = [p.y for p, d in zip(self.body.points, self.body.dominant) if d in bones and abs(p.z - point.z) < band]
        return min(ys)

    def rivets(self, item, points, radius=0.006, bone=None):
        result = []
        for point in points:
            rivet = primitive("uv_sphere", segments=10, ring_count=6, radius=radius, location=point)
            paint(rivet, self.mat(item, "#e6e0d0", 0.3, 1.0))
            nearest = bone or self.nearest_bone(point)
            bind(rivet, self.rig, nearest)
            result.append(rivet)
        return result

    def nearest_bone(self, point):
        index = min(range(len(self.body.points)), key=lambda i: (self.body.points[i] - point).length_squared)
        return self.body.dominant[index]

    def boots(self, item, role, normal, roughness, metallic, top_t, offset):
        b = self.body
        parts = []
        for side, _ in SIDES:
            calf = f"calf_{side}"
            shoe = self.skin_shell(f"{item}.foot{side}", FOOT(side) | {calf}, offset,
                                   cuts=[(b.at(calf, top_t), -b.axis(calf))], uv_scale=24, detail=0.25)
            solidify(shoe, 0.004)
            paint(shoe, self.mat(item, role, roughness, metallic, normal))
            parts.append(shoe)
        return parts

    def leather_boots(self, item):
        b = self.body
        parts = self.boots(item, "primary", "leather", 0.6, 0.0, 0.42, 0.012)
        for side, _ in SIDES:
            calf = f"calf_{side}"
            cuff = tube(b, f"{item}.cuff{side}", bone_stations(b, calf, [0.36, 0.42, 0.47], Vector((1, 0, 0)), [0.026, 0.026, 0.03]),
                        LEG(side), 0.012, segments=28)
            solidify(cuff, 0.005)
            paint(cuff, self.mat(item, "secondary", 0.6, 0.0, "leather"))
            blend(cuff, self.rig, [calf])
            sole = self.skin_shell(f"{item}.sole{side}", FOOT(side) | {calf}, 0.016,
                                   cuts=[(Vector((0, 0, 0.025)), Vector((0, 0, 1)))], uv_scale=24, detail=0.25)
            solidify(sole, 0.008)
            paint(sole, self.mat(item, "#2a1c10", 0.8))
            parts += [cuff, sole]
        return self.finish(item, parts)

    def iron_sabatons(self, item):
        b = self.body
        parts = self.boots(item, "secondary", "leather", 0.6, 0.0, 0.5, 0.012)
        for side, _ in SIDES:
            foot, calf = f"foot_{side}", f"calf_{side}"
            lames = tube(b, f"{item}.lames{side}", bone_stations(b, foot, [0.1, 0.35, 0.6, 0.85, 1.05], Vector((0, 0, 1)),
                                                                  [0.012, 0.016, 0.012, 0.016, 0.012]),
                         FOOT(side), 0.014, segments=18, arc=(-1.6, 1.6))
            solidify(lames, 0.004)
            paint(lames, self.mat(item, "primary", 0.3, 1.0, "metal"))
            blend(lames, self.rig, [foot, f"ball_{side}"])
            ankle = tube(b, f"{item}.ankle{side}", bone_stations(b, calf, [0.72, 0.86, 0.98], Vector((1, 0, 0)), [0.014, 0.012, 0.02]),
                         LEG(side) | FOOT(side), 0.016, segments=28)
            solidify(ankle, 0.005)
            paint(ankle, self.mat(item, "primary", 0.3, 1.0, "metal"))
            blend(ankle, self.rig, [calf])
            parts += [lames, ankle]
        return self.finish(item, parts)

    def gloves(self, item, role, normal, roughness, metallic, cuff_role, cuff_flare, cuff_metallic):
        b = self.body
        parts = []
        for side, _ in SIDES:
            lower = f"lowerarm_{side}"
            hand = self.skin_shell(f"{item}.hand{side}", HAND(side) | {lower}, 0.006,
                                   cuts=[(b.at(lower, 0.8), -b.axis(lower))], uv_scale=30, detail=0.3)
            solidify(hand, 0.003)
            paint(hand, self.mat(item, role, roughness, metallic, normal))
            cuff = tube(b, f"{item}.cuff{side}", bone_stations(b, lower, [0.62, 0.72, 0.84, 0.92], Vector((0, 0, 1)),
                                                               [cuff_flare, cuff_flare * 0.6, 0.006, 0.004]),
                        ARM(side), 0.012, segments=28)
            solidify(cuff, 0.004)
            paint(cuff, self.mat(item, cuff_role, 0.4 if cuff_metallic else 0.65, cuff_metallic,
                                 "metal" if cuff_metallic else "leather"))
            blend(cuff, self.rig, [lower])
            parts += [hand, cuff]
        return parts

    def leather_gloves(self, item):
        return self.finish(item, self.gloves(item, "primary", "leather", 0.6, 0.0, "secondary", 0.018, 0.0))

    def steel_gauntlets(self, item):
        b = self.body
        parts = self.gloves(item, "secondary", "leather", 0.5, 0.0, "primary", 0.035, 1.0)
        for side, _ in SIDES:
            hand = f"hand_{side}"
            plate = tube(b, f"{item}.plate{side}", bone_stations(b, hand, [0.0, 1.0, 2.2, 3.4], Vector((0, 0, 1)),
                                                                  [0.012, 0.014, 0.012, 0.01]),
                         HAND(side), 0.01, segments=14, arc=(-1.3, 1.3), band=0.012)
            solidify(plate, 0.004)
            paint(plate, self.mat(item, "primary", 0.3, 1.0, "metal"))
            bind(plate, self.rig, hand)
            parts.append(plate)
        return self.finish(item, parts)

    def leather_pads(self, item):
        b = self.body
        parts = []
        for side, sign in SIDES:
            upper = f"upperarm_{side}"
            out = Vector((sign, 0, 0.4))
            for i, (t0, t1) in enumerate(((0.0, 0.2), (0.12, 0.32), (0.24, 0.44))):
                lame = tube(b, f"{item}.lame{side}{i}", bone_stations(b, upper, [t0, (t0 + t1) / 2, t1], out,
                                                                       [0.03 - i * 0.004, 0.028 - i * 0.004, 0.024 - i * 0.004]),
                            ARM(side), 0.018 + 0.004 * (2 - i), segments=20, arc=(-1.5, 1.5), band=0.02)
                solidify(lame, 0.006)
                paint(lame, self.mat(item, "primary", 0.6, 0.0, "leather"))
                blend(lame, self.rig, [upper, f"clavicle_{side}"] if i == 0 else [upper])
                parts.append(lame)
            strap = tube(b, f"{item}.strap{side}", bone_stations(b, upper, [0.4, 0.46], out), ARM(side), 0.022, segments=24)
            solidify(strap, 0.004)
            paint(strap, self.mat(item, "secondary", 0.6, 0.0, "leather"))
            blend(strap, self.rig, [upper])
            parts.append(strap)
        return self.finish(item, parts)

    def steel_pauldrons(self, item):
        b = self.body
        parts = []
        for side, sign in SIDES:
            upper = f"upperarm_{side}"
            joint = b.head(upper)
            dome = primitive("uv_sphere", segments=32, ring_count=16, radius=1)
            mesh = bmesh.new()
            mesh.from_mesh(dome.data)
            bmesh.ops.delete(mesh, geom=[v for v in mesh.verts if v.co.z < -0.15], context="VERTS")
            mesh.to_mesh(dome.data)
            mesh.free()
            dome.scale = (0.11, 0.115, 0.085)
            dome.rotation_euler = (0, sign * math.radians(-28), 0)
            dome.location = joint + Vector((sign * 0.02, 0, 0.035))
            solidify(dome, 0.006)
            paint(dome, self.mat(item, "primary", 0.25, 1.0, "metal"))
            blend(dome, self.rig, [upper, f"clavicle_{side}"])
            out = Vector((sign, 0, 0.2))
            parts.append(dome)
            for i, t in enumerate((0.16, 0.3, 0.44)):
                lame = tube(b, f"{item}.lame{side}{i}", bone_stations(b, upper, [t, t + 0.12], out, [0.034 - i * 0.004, 0.03 - i * 0.004]),
                            ARM(side), 0.016, segments=22, arc=(-1.7, 1.7))
                solidify(lame, 0.005)
                paint(lame, self.mat(item, "primary", 0.25, 1.0, "metal"))
                blend(lame, self.rig, [upper])
                parts.append(lame)
            trim = primitive("torus", major_segments=32, minor_segments=8, major_radius=1, minor_radius=0.06)
            trim.scale = (0.112, 0.117, 0.09)
            trim.rotation_euler = (0, sign * math.radians(-28), 0)
            trim.location = joint + Vector((sign * 0.02, 0, 0.023))
            paint(trim, self.mat(item, "secondary", 0.6, 0.0, "leather"))
            blend(trim, self.rig, [upper, f"clavicle_{side}"])
            parts.append(trim)
        return self.finish(item, parts)

    def wool_hood(self, item):
        b = self.body
        head = b.head("head")
        crown = b.extent({"head"}, (0, 0, 1))
        front = b.extent({"head"}, (0, -1, 0))
        face_z = head.z + (crown - head.z) * 0.35
        opening = (Vector((0, -front + 0.065, face_z)), Vector((0, -1, -0.35)).normalized())
        hood = self.skin_shell(f"{item}.hood", {"head", "neck_01"}, 0.03,
                               cuts=[(b.at("neck_01", 0.1), Vector((0, 0, -1))), opening], uv_scale=24)
        relax(hood, 12)
        solidify(hood, 0.006)
        paint(hood, self.mat(item, "primary", 0.95, 0.0, "cloth"))
        cowl = tube(b, f"{item}.cowl", bone_stations(b, "neck_01", [0.05, -0.2, -0.45, -0.7], Vector((1, 0, 0)),
                                                     [0.018, 0.02, 0.024, 0.028], [1.0, 0.96, 0.9, 0.85]),
                    {"neck_01", "spine_03", "clavicle_l", "clavicle_r"}, 0.02, segments=48, band=0.02)
        solidify(cowl, 0.006)
        paint(cowl, self.mat(item, "primary", 0.95, 0.0, "cloth"))
        blend(cowl, self.rig, ["neck_01", "spine_03"])
        trim = tube(b, f"{item}.trim", bone_stations(b, "neck_01", [-0.55, -0.65], Vector((1, 0, 0)), [0.045, 0.045], [0.86, 0.85]),
                    {"neck_01", "spine_03", "clavicle_l", "clavicle_r"}, 0.02, segments=48, band=0.02)
        solidify(trim, 0.006)
        paint(trim, self.mat(item, "secondary", 0.9, 0.0, "cloth"))
        blend(trim, self.rig, ["spine_03"])
        return self.finish(item, [hood, cowl, trim])

    def iron_helm(self, item):
        b = self.body
        head = b.head("head")
        crown = b.extent({"head"}, (0, 0, 1))
        brow = head.z + (crown - head.z) * 0.44
        zs = [brow + (crown - brow) * i / 8 for i in range(8)]
        centre = Vector((0, head.y + 0.01, 0))
        dome = tube(b, f"{item}.dome", vertical_stations(centre.x, centre.y, zs, [0.0, 0.0, 0.0, 0.002, 0.005, 0.008, 0.01, 0.012]),
                    {"head"}, 0.03, segments=40, band=0.012, cap=Vector((0, centre.y + 0.005, crown + 0.075)))
        solidify(dome, 0.006)
        paint(dome, self.mat(item, "primary", 0.28, 1.0, "metal"))
        band = tube(b, f"{item}.band", vertical_stations(centre.x, centre.y, [brow + 0.03, brow - 0.006]), {"head"}, 0.036,
                    segments=40, band=0.012)
        solidify(band, 0.006)
        paint(band, self.mat(item, "secondary", 0.35, 1.0, "metal"))
        front = b.extent({"head"}, (0, -1, 0))
        nasal = primitive("cube", size=1)
        nasal.scale = (0.022, 0.008, 0.085)
        nasal.location = (0, -front - 0.016, brow - 0.035)
        bevel(nasal, 0.003)
        paint(nasal, self.mat(item, "primary", 0.28, 1.0, "metal"))
        parts = [dome, band, nasal]
        for obj in parts:
            bind(obj, self.rig, "head")
        radius = b.extent({"head"}, (1, 0, 0)) + 0.04
        parts += self.rivets(item, [Vector((math.sin(a) * radius, centre.y - math.cos(a) * (front + 0.04 + centre.y) * 0.98, brow + 0.012))
                                    for a in [i * math.pi / 5 - math.pi * 0.8 for i in range(9)]], 0.005, "head")
        return self.finish(item, parts)

    def grip(self, side, local):
        return self.rig.data.bones[f"hand_{side}"].matrix_local @ local

    def short_sword(self, item):
        steel = self.mat(item, "primary", 0.22, 1.0)
        grip = self.mat(item, "secondary", 0.6, 0.0, "leather")
        gold = self.mat(item, "#c9a24a", 0.3, 1.0)
        blade = primitive("cube", size=1)
        blade.scale = (0.05, 0.009, 0.62)
        blade.location = (0, 0, 0.42)
        taper_top(blade, 0.15)
        bevel(blade, 0.003)
        paint(blade, steel)
        fuller = primitive("cube", size=1)
        fuller.scale = (0.012, 0.0105, 0.42)
        fuller.location = (0, 0, 0.38)
        paint(fuller, self.mat(item, "#7c858d", 0.3, 1.0))
        guard = primitive("cube", size=1)
        guard.scale = (0.2, 0.026, 0.024)
        guard.location = (0, 0, 0.1)
        bevel(guard, 0.008)
        paint(guard, gold)
        handle = primitive("cylinder", vertices=16, radius=0.017, depth=0.15, location=(0, 0, 0.02))
        paint(handle, grip)
        pommel = primitive("uv_sphere", segments=16, ring_count=10, radius=0.03, location=(0, 0, -0.065))
        paint(pommel, gold)
        return self.weapon(item, [blade, fuller, guard, handle, pommel], "r")

    def flanged_mace(self, item):
        steel = self.mat(item, "primary", 0.3, 1.0, "metal")
        wood = self.mat(item, "secondary", 0.6, 0.0, "wood")
        shaft = primitive("cylinder", vertices=16, radius=0.018, depth=0.62, location=(0, 0, 0.18))
        paint(shaft, wood)
        head = primitive("cylinder", vertices=16, radius=0.032, depth=0.16, location=(0, 0, 0.5))
        paint(head, steel)
        parts = [shaft, head]
        for i in range(7):
            flange = primitive("cube", size=1)
            flange.scale = (0.075, 0.01, 0.15)
            taper_top(flange, 0.55, axis="x")
            flange.location = (0.035, 0, 0.5)
            flange.rotation_euler = (0, 0, 2 * math.pi * i / 7)
            bevel(flange, 0.003)
            paint(flange, steel)
            flange.location = (math.cos(2 * math.pi * i / 7) * 0.035, math.sin(2 * math.pi * i / 7) * 0.035, 0.5)
            parts.append(flange)
        cap = primitive("uv_sphere", segments=16, ring_count=8, radius=0.03, location=(0, 0, 0.6))
        paint(cap, steel)
        wrap = primitive("cylinder", vertices=16, radius=0.021, depth=0.16, location=(0, 0, 0.0))
        paint(wrap, self.mat(item, "#3a2614", 0.7, 0.0, "leather"))
        knob = primitive("uv_sphere", segments=12, ring_count=8, radius=0.026, location=(0, 0, -0.1))
        paint(knob, steel)
        return self.weapon(item, parts + [cap, wrap, knob], "r")

    def parrying_dagger(self, item):
        steel = self.mat(item, "primary", 0.22, 1.0)
        gold = self.mat(item, "secondary", 0.3, 1.0)
        blade = primitive("cube", size=1)
        blade.scale = (0.036, 0.008, 0.3)
        blade.location = (0, 0, 0.26)
        taper_top(blade, 0.1)
        bevel(blade, 0.002)
        paint(blade, steel)
        guard = primitive("cylinder", vertices=12, radius=0.008, depth=0.2, location=(0, 0, 0.1), rotation=(0, math.pi / 2, 0))
        paint(guard, gold)
        ring = primitive("torus", major_segments=20, minor_segments=8, major_radius=0.03, minor_radius=0.005,
                         location=(0, -0.01, 0.12), rotation=(math.pi / 2, 0, 0))
        paint(ring, gold)
        handle = primitive("cylinder", vertices=14, radius=0.015, depth=0.12, location=(0, 0, 0.03))
        paint(handle, self.mat(item, "#3a2614", 0.7, 0.0, "leather"))
        pommel = primitive("uv_sphere", segments=14, ring_count=8, radius=0.022, location=(0, 0, -0.04))
        paint(pommel, gold)
        return self.weapon(item, [blade, guard, ring, handle, pommel], "l")

    def wooden_shield(self, item):
        b = self.body
        wood = self.mat(item, "primary", 0.75, 0.0, "wood")
        iron = self.mat(item, "secondary", 0.35, 1.0, "metal")
        board = primitive("cylinder", vertices=48, radius=0.3, depth=0.022)
        paint(board, wood)
        rim = primitive("torus", major_segments=48, minor_segments=8, major_radius=0.3, minor_radius=0.014)
        paint(rim, iron)
        boss = primitive("uv_sphere", segments=24, ring_count=12, radius=0.075)
        mesh = bmesh.new()
        mesh.from_mesh(boss.data)
        bmesh.ops.delete(mesh, geom=[v for v in mesh.verts if v.co.z < -0.005], context="VERTS")
        mesh.to_mesh(boss.data)
        mesh.free()
        boss.scale = (1, 1, 0.6)
        boss.location = (0, 0, 0.011)
        paint(boss, iron)
        parts = [board, rim, boss]
        for i in range(10):
            a = 2 * math.pi * i / 10
            stud = primitive("uv_sphere", segments=10, ring_count=6, radius=0.009,
                             location=(math.cos(a) * 0.265, math.sin(a) * 0.265, 0.012))
            paint(stud, iron)
            parts.append(stud)
        for x in (-0.12, 0.12):
            strap = primitive("cube", size=1, location=(x, 0, 0.0))
            strap.scale = (0.028, 0.56, 0.026)
            paint(strap, iron)
            parts.append(strap)
        shield = join(parts, f"item_{item}")
        lower = "lowerarm_l"
        centre = b.at(lower, 0.55)
        out = Vector((1, 0.25, 0)).normalized()
        arm = b.axis(lower)
        z = out
        y = (arm - z * arm.dot(z)).normalized()
        x = y.cross(z)
        frame = Matrix((x, y, z)).transposed().to_4x4()
        frame.translation = centre + out * 0.07
        place(shield, frame)
        bind(shield, self.rig, lower)
        return self.finish(item, [shield])

    def weapon(self, item, parts, side):
        obj = join(parts, f"item_{item}")
        local = Matrix.Translation((0.0, 0.035, -0.012)) @ Matrix.Rotation(math.radians(-90), 4, "X")
        place(obj, self.grip(side, local))
        bind(obj, self.rig, f"hand_{side}")
        return self.finish(item, [obj])

    BUILDERS = {
        "hood": "wool_hood", "helm": "iron_helm", "pads": "leather_pads", "pauldrons": "steel_pauldrons",
        "tunic": "linen_tunic", "mail": "chain_mail", "leather": "leather_gloves", "gauntlets": "steel_gauntlets",
        "trousers": "wool_trousers", "greaves": "iron_greaves", "boots": "leather_boots", "sabatons": "iron_sabatons",
        "sword": "short_sword", "mace": "flanged_mace", "shield": "wooden_shield", "dagger": "parrying_dagger",
    }

    def build(self, item):
        return getattr(self, self.BUILDERS[item["kind"]])(item["id"])


def bevel(obj, width):
    modifier = obj.modifiers.new("bevel", "BEVEL")
    modifier.width = width
    modifier.segments = 2
    apply_modifiers(obj, keep_armature=False)


def taper_top(obj, ratio, axis="z"):
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mesh = obj.data
    index = "xyz".index(axis)
    top = max(v.co[index] for v in mesh.vertices)
    for vertex in mesh.vertices:
        if vertex.co[index] > top - 1e-6:
            for k in range(3):
                if k != index:
                    vertex.co[k] *= ratio


def surface(mat, cutout):
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    alpha = bsdf.inputs["Alpha"]
    source = alpha.links[0].from_socket if alpha.links else None
    for link in list(alpha.links):
        links.remove(link)
    mat.use_backface_culling = not cutout
    if cutout and source is not None:
        step = nodes.new("ShaderNodeMath")
        step.operation = "ROUND"
        links.new(source, step.inputs[0])
        links.new(step.outputs[0], alpha)


def tidy(rig, parts):
    for name, obj in parts.items():
        obj.name = name
        obj.data.name = name
        for mat in obj.data.materials:
            surface(mat, cutout=name in ("hair", "eyebrows", "eyelashes"))
    for image in bpy.data.images:
        if image.size[0] > 1024:
            image.scale(1024, 1024 * image.size[1] // image.size[0])
    for obj in bpy.data.objects:
        if obj.type == "MESH" and obj.parent is None:
            obj.parent = rig
    rig.name = "rig"


def export(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_animations=True, export_skins=True,
                              export_morph=False, export_image_format="WEBP", export_image_quality=82,
                              export_def_bones=True, export_force_sampling=True, export_frame_range=True,
                              export_extras=False, export_apply=False, export_yup=True)


def icons(items, folder, size=128):
    import numpy as np
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 32
    scene.cycles.device = "CPU"
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("icons")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.35, 0.33, 0.3, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    scene.world = world
    for name, place_at, energy in (("key", (2.0, -3.0, 2.6), 400), ("fill", (-2.5, -2.0, 1.4), 120), ("rim", (0.5, 3.0, 2.5), 300)):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
        light.data.energy = energy
        light.data.size = 3
        light.location = place_at
        light.rotation_euler = (-Vector(place_at)).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(light)
    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    camera.data.type = "ORTHO"
    scene.collection.objects.link(camera)
    scene.camera = camera
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    atlas = np.zeros((size * 4, size * 4, 4), dtype=np.float32)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for index, item in enumerate(items):
        target = bpy.data.objects[f"item_{item['id']}"]
        for obj in meshes:
            obj.hide_render = obj is not target
        evaluated = target.evaluated_get(depsgraph)
        points = [evaluated.matrix_world @ v.co for v in evaluated.to_mesh().vertices]
        evaluated.to_mesh_clear()
        if item["kind"] in ("leather", "gauntlets", "boots", "sabatons", "pads", "pauldrons"):
            side = 1 if item["kind"] in ("pads", "pauldrons") else -1
            points = [p for p in points if p.x * side > 0] or points
        low = Vector([min(p[k] for p in points) for k in range(3)])
        high = Vector([max(p[k] for p in points) for k in range(3)])
        centre = (low + high) / 2
        turn = math.radians(-28)
        direction = Vector((math.sin(turn), -math.cos(turn), 0.18)).normalized()
        camera.location = centre + direction * 4
        camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
        camera.data.ortho_scale = max((high - low).length * (1.0 if item["slot"] in ("mainHand", "offHand") else 0.82), 0.12)
        path = f"{folder}/{item['id']}.png"
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        image = bpy.data.images.load(path)
        pixels = np.array(image.pixels[:], dtype=np.float32).reshape(size, size, 4)
        row, column = divmod(index, 4)
        atlas[(3 - row) * size:(4 - row) * size, column * size:(column + 1) * size] = pixels
        bpy.data.images.remove(image)
    sheet = bpy.data.images.new("icons", size * 4, size * 4, alpha=True)
    sheet.pixels.foreach_set(atlas.ravel())
    sheet.filepath_raw = f"{folder}/icons.png"
    sheet.file_format = "PNG"
    sheet.save()


if __name__ == "__main__":
    options = arguments()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rig, parts = human(options["body"])
    body = Body(rig, parts["body"])
    items = json.load(open(options["items"]))
    wardrobe = Wardrobe(body, items, textures())
    only = options["only"].split(",") if options.get("only") else None
    for item in items:
        if only is None or item["id"] in only:
            wardrobe.build(item)
    tidy(rig, parts)
    idle(rig)
    if "blend" in options:
        bpy.ops.wm.save_as_mainfile(filepath=options["blend"])
    if "glb" in options:
        export(options["glb"])
    if "icons" in options:
        icons(items, options["icons"])
