import asyncio
from datetime import date

from sqlalchemy import select

from app.database import async_session
from app.models.region import Region
from app.models.datacenter import DataCenter
from app.models.engineer import Engineer, TimeSlot
from app.models.work import Work, WorkChunk, Priority, WorkType, WorkStatus, ChunkStatus


async def ensure_region(session, region_id: str, name: str) -> Region:
    result = await session.execute(select(Region).where(Region.id == region_id))
    region = result.scalar_one_or_none()
    if region:
        return region
    region = Region(id=region_id, name=name)
    session.add(region)
    await session.flush()
    return region


async def ensure_datacenter(session, dc_id: str, name: str, description: str, region_id: str) -> DataCenter:
    result = await session.execute(select(DataCenter).where(DataCenter.id == dc_id))
    dc = result.scalar_one_or_none()
    if dc:
        return dc
    dc = DataCenter(id=dc_id, name=name, description=description, region_id=region_id)
    session.add(dc)
    await session.flush()
    return dc


async def ensure_engineer(session, eng_id: str, name: str, region_id: str) -> Engineer:
    result = await session.execute(select(Engineer).where(Engineer.id == eng_id))
    eng = result.scalar_one_or_none()
    if eng:
        return eng
    eng = Engineer(id=eng_id, name=name, region_id=region_id)
    session.add(eng)
    await session.flush()
    return eng


async def ensure_timeslot_range(session, engineer_id: str, start_date: date, end_date: date, start_hour: int, end_hour: int) -> None:
    current = start_date
    while current <= end_date:
        ts = TimeSlot(engineer_id=engineer_id, date=current, start_hour=start_hour, end_hour=end_hour)
        session.add(ts)
        current = current.fromordinal(current.toordinal() + 1)


async def seed_regions_and_dcs(session):
    # Регионы
    region_msk = await ensure_region(session, "region-msk", "Москва")
    region_spb = await ensure_region(session, "region-spb", "Санкт-Петербург")
    region_nsk = await ensure_region(session, "region-nsk", "Новосибирск")

    # ДЦ
    await ensure_datacenter(
        session,
        "dc-msk-1",
        "MSK-1 Ostankino",
        "Основной датацентр в Останкино, магистральные узлы и ядро сети.",
        region_msk.id,
    )
    await ensure_datacenter(
        session,
        "dc-msk-2",
        "MSK-2 Butovo",
        "Резервный датацентр на юге Москвы, клиентские стойки.",
        region_msk.id,
    )

    await ensure_datacenter(
        session,
        "dc-spb-1",
        "SPB-1 Primorsky",
        "Опорный узел на севере города, магистральные каналы.",
        region_spb.id,
    )
    await ensure_datacenter(
        session,
        "dc-spb-2",
        "SPB-2 Pulkovo",
        "Узел вблизи аэропорта, концентратор региональных подключений.",
        region_spb.id,
    )

    await ensure_datacenter(
        session,
        "dc-nsk-1",
        "NSK-1 Akadem",
        "Датацентр в Академгородке, часть научной инфраструктуры.",
        region_nsk.id,
    )
    await ensure_datacenter(
        session,
        "dc-nsk-2",
        "NSK-2 Center",
        "Центральный узел в городе, клиентские стойки и кэш.",
        region_nsk.id,
    )


async def seed_engineers(session):
    # Инженеры
    eng_ivanov = await ensure_engineer(session, "eng-ivanov", "Иванов Пётр", "region-msk")
    eng_petrov = await ensure_engineer(session, "eng-petrov", "Петров Сергей", "region-spb")
    eng_sidorov = await ensure_engineer(session, "eng-sidorov", "Сидоров Антон", "region-nsk")
    eng_smirnova = await ensure_engineer(session, "eng-smirnova", "Смирнова Ольга", "region-msk")
    eng_kozlov = await ensure_engineer(session, "eng-kozlov", "Козлов Дмитрий", "region-spb")

    # Простые слоты на неделю вперёд
    today = date.today()
    week_later = date.fromordinal(today.toordinal() + 6)

    await ensure_timeslot_range(session, eng_ivanov.id, today, week_later, 9, 18)
    await ensure_timeslot_range(session, eng_petrov.id, today, week_later, 10, 19)
    await ensure_timeslot_range(session, eng_sidorov.id, today, week_later, 8, 17)
    await ensure_timeslot_range(session, eng_smirnova.id, today, week_later, 11, 20)
    await ensure_timeslot_range(session, eng_kozlov.id, today, week_later, 12, 21)


async def seed_works_and_chunks(session):
    # Утилита: получить ДЦ
    async def get_dc(dc_id: str) -> str:
        res = await session.execute(select(DataCenter).where(DataCenter.id == dc_id))
        dc = res.scalar_one()
        return dc.id

    # 1. Переввод магистрального линка MSK-1 ↔ SPB-1
    work1 = Work(
        id="work-backbone-relocate",
        project_id="proj-backbone-2025",
        name="Переввод магистрального линка MSK-1 ↔ SPB-1",
        description="Переввод магистрального линка между узлами MSK-1 и SPB-1 на новый тракт.",
        work_type=WorkType.GENERAL,
        priority=Priority.CRITICAL,
        status=WorkStatus.CREATED,
        data_center_id=await get_dc("dc-msk-1"),
        due_date=date(2025, 12, 20),
    )
    session.add(work1)
    await session.flush()

    chunk1_1 = WorkChunk(
        id="chunk-backbone-precheck",
        work_id=work1.id,
        title="Предварительная проверка каналов и резервирования",
        duration_hours=3,
        order=1,
        status=ChunkStatus.CREATED,
        priority=Priority.CRITICAL,
        data_center_id=await get_dc("dc-msk-1"),
    )
    chunk1_2 = WorkChunk(
        id="chunk-backbone-switch-msk",
        work_id=work1.id,
        title="Переключение линка на новый тракт в MSK-1",
        duration_hours=2,
        order=2,
        status=ChunkStatus.CREATED,
        priority=Priority.CRITICAL,
        data_center_id=await get_dc("dc-msk-1"),
    )
    chunk1_3 = WorkChunk(
        id="chunk-backbone-switch-spb",
        work_id=work1.id,
        title="Переключение линка на новый тракт в SPB-1",
        duration_hours=2,
        order=3,
        status=ChunkStatus.CREATED,
        priority=Priority.CRITICAL,
        data_center_id=await get_dc("dc-spb-1"),
        linked_chunk_id="chunk-backbone-switch-msk",
    )

    # зависимости
    chunk1_2.dependencies.append(chunk1_1)

    session.add_all([chunk1_1, chunk1_2, chunk1_3])

    # 2. Расширение стойки клиента X в MSK-2
    work2 = Work(
        id="work-rack-extension-msk2",
        name="Расширение стойки клиента X в MSK-2",
        description="Добавление юнитов и прокладка патч-кордов для клиента X.",
        work_type=WorkType.GENERAL,
        priority=Priority.HIGH,
        status=WorkStatus.CREATED,
        data_center_id=await get_dc("dc-msk-2"),
        due_date=date(2025, 12, 10),
    )
    session.add(work2)
    await session.flush()

    chunk2_1 = WorkChunk(
        id="chunk-rack-delivery",
        work_id=work2.id,
        title="Приёмка оборудования и проверка комплектности",
        duration_hours=2,
        order=1,
        status=ChunkStatus.CREATED,
        data_center_id=await get_dc("dc-msk-2"),
    )
    chunk2_2 = WorkChunk(
        id="chunk-rack-install",
        work_id=work2.id,
        title="Монтаж доп. юнитов и прокладка патч-кордов",
        duration_hours=4,
        order=2,
        status=ChunkStatus.CREATED,
        data_center_id=await get_dc("dc-msk-2"),
    )
    chunk2_2.dependencies.append(chunk2_1)
    session.add_all([chunk2_1, chunk2_2])

    # 3. PNR: Ввод в эксплуатацию кластера виртуализации (SPB-2)
    work3 = Work(
        id="work-pnr-virt-spb2",
        name="PNR кластера виртуализации в SPB-2",
        description="Ввод в эксплуатацию нового кластера виртуализации.",
        work_type=WorkType.PNR,
        priority=Priority.HIGH,
        status=WorkStatus.CREATED,
        data_center_id=await get_dc("dc-spb-2"),
        start_date=date(2025, 12, 15),
        end_date=date(2025, 12, 18),
        total_hours=24,
        remaining_hours=24,
        engineers_required=1,
        time_slot_start=10,
        time_slot_end=18,
    )
    session.add(work3)
    await session.flush()

    chunk3_1 = WorkChunk(
        id="chunk-virt-install",
        work_id=work3.id,
        title="Установка гипервизоров на сервера",
        duration_hours=8,
        order=1,
        status=ChunkStatus.CREATED,
        data_center_id=await get_dc("dc-spb-2"),
    )
    chunk3_2 = WorkChunk(
        id="chunk-virt-config",
        work_id=work3.id,
        title="Настройка кластера и сетевых связей",
        duration_hours=8,
        order=2,
        status=ChunkStatus.CREATED,
        data_center_id=await get_dc("dc-spb-2"),
    )
    chunk3_3 = WorkChunk(
        id="chunk-virt-tests",
        work_id=work3.id,
        title="Нагрузочное тестирование и failover",
        duration_hours=8,
        order=3,
        status=ChunkStatus.CREATED,
        data_center_id=await get_dc("dc-spb-2"),
    )
    chunk3_2.dependencies.append(chunk3_1)
    chunk3_3.dependencies.append(chunk3_2)
    session.add_all([chunk3_1, chunk3_2, chunk3_3])

    # 4. Support: Сопровождение планового окна (NSK-1)
    work4 = Work(
        id="work-support-window-nsk1",
        name="Сопровождение планового окна сети в NSK-1",
        description="Онлайн контроль изменения конфигурации в плановое окно.",
        work_type=WorkType.SUPPORT,
        priority=Priority.MEDIUM,
        status=WorkStatus.CREATED,
        data_center_id=await get_dc("dc-nsk-1"),
        target_date=date(2025, 12, 12),
        total_hours=6,
        remaining_hours=6,
    )
    session.add(work4)
    await session.flush()

    chunk4_1 = WorkChunk(
        id="chunk-support-nsk1",
        work_id=work4.id,
        title="Онлайн контроль и откат при проблемах",
        duration_hours=6,
        order=1,
        status=ChunkStatus.CREATED,
        data_center_id=await get_dc("dc-nsk-1"),
    )
    session.add(chunk4_1)

    # 5. General: Замена батарей UPS (MSK-1)
    work5 = Work(
        id="work-ups-batteries-msk1",
        name="Замена батарей UPS в MSK-1, зал А",
        description="Плановая замена батарей в UPS с тестированием.",
        work_type=WorkType.GENERAL,
        priority=Priority.MEDIUM,
        status=WorkStatus.CREATED,
        data_center_id=await get_dc("dc-msk-1"),
        due_date=date(2026, 1, 15),
    )
    session.add(work5)
    await session.flush()

    chunk5_1 = WorkChunk(
        id="chunk-ups-precheck",
        work_id=work5.id,
        title="Проверка текущего состояния UPS и нагрузок",
        duration_hours=2,
        order=1,
        status=ChunkStatus.CREATED,
        data_center_id=await get_dc("dc-msk-1"),
    )
    chunk5_2 = WorkChunk(
        id="chunk-ups-replacement",
        work_id=work5.id,
        title="Физическая замена батарей",
        duration_hours=4,
        order=2,
        status=ChunkStatus.CREATED,
        data_center_id=await get_dc("dc-msk-1"),
    )
    chunk5_3 = WorkChunk(
        id="chunk-ups-postcheck",
        work_id=work5.id,
        title="Пост-проверка, тестирование нагрузки и логов",
        duration_hours=2,
        order=3,
        status=ChunkStatus.CREATED,
        data_center_id=await get_dc("dc-msk-1"),
    )
    chunk5_2.dependencies.append(chunk5_1)
    chunk5_3.dependencies.append(chunk5_2)
    session.add_all([chunk5_1, chunk5_2, chunk5_3])

    # 6. General: Чистка оптических кроссов (SPB-1)
    work6 = Work(
        id="work-clean-optics-spb1",
        name="Чистка оптических кроссов в SPB-1",
        description="Плановая чистка оптических коннекторов и кроссов.",
        work_type=WorkType.GENERAL,
        priority=Priority.LOW,
        status=WorkStatus.CREATED,
        data_center_id=await get_dc("dc-spb-1"),
        due_date=date(2026, 2, 1),
    )
    session.add(work6)
    await session.flush()

    chunk6_1 = WorkChunk(
        id="chunk-optics-audit",
        work_id=work6.id,
        title="Аудит задействованных портов и фиксация схемы",
        duration_hours=3,
        order=1,
        status=ChunkStatus.CREATED,
        data_center_id=await get_dc("dc-spb-1"),
    )
    chunk6_2 = WorkChunk(
        id="chunk-optics-clean",
        work_id=work6.id,
        title="Физическая чистка коннекторов и патч-кордов",
        duration_hours=5,
        order=2,
        status=ChunkStatus.CREATED,
        data_center_id=await get_dc("dc-spb-1"),
    )
    chunk6_2.dependencies.append(chunk6_1)
    session.add_all([chunk6_1, chunk6_2])


async def main():
    async with async_session() as session:
        async with session.begin():
            await seed_regions_and_dcs(session)
            await seed_engineers(session)
            await seed_works_and_chunks(session)


if __name__ == "__main__":
    asyncio.run(main())
