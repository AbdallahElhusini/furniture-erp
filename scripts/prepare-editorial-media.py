"""Build the curated, web-ready HATAB editorial image library.

The source files are supplied separately from the application repository.  The
script keeps the mapping explicit so a future content handoff can reproduce the
same filenames without changing storefront code.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps


DOWNLOADS = Path(r"C:\Users\Abdallah\Downloads")
GENERATED_RECEPTION = Path(
    r"C:\Users\Abdallah\.codex\generated_images"
    r"\01a0308b-619a-7a00-8a7e-52d77b778273"
    r"\exec-7242cb59-4509-4cf1-9025-cd235fb86159.png"
)
GENERATED_WAITING = Path(
    r"C:\Users\Abdallah\.codex\generated_images"
    r"\01a0308b-619a-7a00-8a7e-52d77b778273"
    r"\exec-1f4a7b85-831f-4289-bb77-b794bb6c423d.png"
)
GENERATED_HOME_HERO = Path(
    r"C:\Users\Abdallah\.codex\generated_images"
    r"\01a0308b-619a-7a00-8a7e-52d77b778273"
    r"\exec-61f2cd36-5de9-4513-b132-3656663372f8.png"
)
GENERATED_CABINETS_STORAGE = Path(
    r"C:\Users\Abdallah\.codex\generated_images"
    r"\01a0308b-619a-7a00-8a7e-52d77b778273"
    r"\exec-29677f88-5365-4cd1-8e20-599e3e09a4bd.png"
)
GENERATED_OFFICE_ACCESSORIES = Path(
    r"C:\Users\Abdallah\.codex\generated_images"
    r"\01a0308b-619a-7a00-8a7e-52d77b778273"
    r"\exec-1833e0a6-8b62-4672-adb1-7d6fc6d771af.png"
)
GENERATED_BOHO_NATURAL = Path(
    r"C:\Users\Abdallah\.codex\generated_images"
    r"\01a0308b-619a-7a00-8a7e-52d77b778273"
    r"\exec-d013f9c6-e36b-485b-8c49-18b9034136e5.png"
)
GENERATED_CONTEMPORARY = Path(
    r"C:\Users\Abdallah\.codex\generated_images"
    r"\01a0308b-619a-7a00-8a7e-52d77b778273"
    r"\exec-b50b9530-186f-462d-9c82-f03195a6dfb2.png"
)
GENERATED_PROJECT_CONSULTATION = Path(
    r"C:\Users\Abdallah\.codex\generated_images"
    r"\01a0308b-619a-7a00-8a7e-52d77b778273"
    r"\exec-676fe4a1-c1a3-4633-b71c-6ec336b4fa09.png"
)
GENERATED_ACOUSTIC_PARTITIONS = Path(
    r"C:\Users\Abdallah\.codex\generated_images"
    r"\01a0499d-915f-72e3-b9f6-8d414ebab0fd"
    r"\exec-63d10214-897e-4fe2-b719-e6de55984954.png"
)
GENERATED_COUNTER_STOOLS = Path(
    r"C:\Users\Abdallah\.codex\generated_images"
    r"\01a0499d-915f-72e3-b9f6-8d414ebab0fd"
    r"\exec-5cea859d-1abc-4052-962e-39ce99491e3b.png"
)
GENERATED_MULTIPURPOSE_TABLES = Path(
    r"C:\Users\Abdallah\.codex\generated_images"
    r"\01a0499e-4e70-7de1-8db1-e453251144a4"
    r"\exec-a5345187-abe3-4a0d-9189-f0ab65a31325.png"
)
GENERATED_SMART_WORKSPACE = Path(
    r"C:\Users\Abdallah\.codex\generated_images"
    r"\01a0499e-4e70-7de1-8db1-e453251144a4"
    r"\exec-c76df81e-9acb-45be-a415-6b2409a1d87c.png"
)
GENERATED_CLASSIC_BOARDROOM = Path(
    r"C:\Users\Abdallah\.codex\generated_images"
    r"\01a049a6-6c63-78f3-8934-fbff52266257"
    r"\exec-6b6576bc-ac7a-43d0-a43d-e481426c0a36.png"
)
GENERATED_DYNAMIC_WORKSPACE = Path(
    r"C:\Users\Abdallah\.codex\generated_images"
    r"\01a049a6-6c63-78f3-8934-fbff52266257"
    r"\exec-ed22e04a-89e0-4a83-b1a3-093fcf6ea24a.png"
)
GENERATED_WAITING_BEAM = Path(
    r"C:\Users\Abdallah\.codex\generated_images"
    r"\01a049a6-6c63-78f3-8934-fbff52266257"
    r"\exec-f25375cd-2975-44e0-85d4-1ba225fdb490.png"
)
OUTPUT = Path("public/images/editorial")

SOURCES = {
    "executive-stage.webp": DOWNLOADS / "WhatsApp Image 2026-08-28 at 6.22.53 PM.jpeg",
    "open-learning.webp": DOWNLOADS / "02_World_MultiPurposeRoom.jpg",
    "huddle-room.webp": DOWNLOADS / "04_World_ElevatedHuddle.jpg",
    "elevated-collaboration.webp": DOWNLOADS / "02_World_ElevatedHuddle.jpg",
    "smart-conference.webp": DOWNLOADS / "02_SmartConference_Upholstered_Meeting.jpg",
    "leather-boardroom.webp": DOWNLOADS / "03_SmarConference_Leather_Meeting.jpg",
    "executive-boardroom.webp": DOWNLOADS / "01_Summa_Upholstered_ExecutiveConference.jpg",
    "sit-stand-motion.webp": DOWNLOADS / "sit-stand.jpg",
    "mesh-detail.webp": DOWNLOADS / "TexMesh_Blog_Hero.jpg",
    "home-office.webp": DOWNLOADS / "Shop-Online.jpg",
    "operational-office.webp": DOWNLOADS / "Commercial.jpg",
    "dynamic-studio.webp": DOWNLOADS / "uw_home_never_too_much_20260113.jpg.rendition.1920.1920.jpg",
    "reception-lounge.webp": GENERATED_RECEPTION,
    "waiting-lounge.webp": GENERATED_WAITING,
    "home-hero.webp": GENERATED_HOME_HERO,
    "cabinets-storage.webp": GENERATED_CABINETS_STORAGE,
    "office-accessories.webp": GENERATED_OFFICE_ACCESSORIES,
    "boho-natural-workspace.webp": GENERATED_BOHO_NATURAL,
    "contemporary-workspace.webp": GENERATED_CONTEMPORARY,
    "project-consultation.webp": GENERATED_PROJECT_CONSULTATION,
    "acoustic-partitions.webp": GENERATED_ACOUSTIC_PARTITIONS,
    "counter-stools.webp": GENERATED_COUNTER_STOOLS,
    "multipurpose-tables.webp": GENERATED_MULTIPURPOSE_TABLES,
    "smart-workspace.webp": GENERATED_SMART_WORKSPACE,
    "classic-boardroom.webp": GENERATED_CLASSIC_BOARDROOM,
    "dynamic-workspace.webp": GENERATED_DYNAMIC_WORKSPACE,
    "waiting-beam-seating.webp": GENERATED_WAITING_BEAM,
}


def prepare(source: Path, destination: Path) -> tuple[int, int, int]:
    if not source.is_file():
        raise FileNotFoundError(source)

    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
        if image.width > 1920:
            height = round(image.height * (1920 / image.width))
            image = image.resize((1920, height), Image.Resampling.LANCZOS)
        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(destination, "WEBP", quality=84, method=6)
        return image.width, image.height, destination.stat().st_size


def main() -> None:
    for filename, source in SOURCES.items():
        destination = OUTPUT / filename
        width, height, byte_count = prepare(source, destination)
        print(f"{filename}: {width}x{height}, {byte_count:,} bytes")


if __name__ == "__main__":
    main()
